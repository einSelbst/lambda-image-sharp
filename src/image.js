/* jshint esversion: 6 */
import imageSize from 'image-size';
import { imgconfig } from './config';
import { get, upload } from './s3';
import sharpify from './sharp';
import { makeKey, decodeS3EventKey } from './utils';

const { key: fileNameKey, params, output } = imgconfig;

let maxWidth = output.default.maxWidth;
let maxHeight = output.default.maxHeight;
let outputdir = output.default.outputdir;
let transformtype = output.default.transformtype;

const imageMimeTypes = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
};

export default (async function processItem (event) {

    const { eventName, s3: { object: { key: undecodedKey } } = { object: { key: false } },} = event;
    const key = decodeS3EventKey(undecodedKey);

    const crumbs = key.split('/');
    const directory = crumbs.slice(0, crumbs.length - 1).join('/');
    if (directory != 'undefined' || directory.length > 0) {
        const imageconfig = output[directory];
        if (typeof imageconfig != 'undefined') {
            maxWidth = imageconfig.maxWidth;
            maxHeight = imageconfig.maxHeight ? imageconfig.maxHeight : null;
            outputdir = imageconfig.outputdir ? imageconfig.outputdir : output.default.outputdir;
            transformtype = imageconfig.transformtype ? imageconfig.transformtype : 'sizes';
        }
    }

    if (eventName.split(':')[0] !== 'ObjectCreated') {
        throw new Error(
            `Event does not contain a valid type (e.g. ObjectCreated). Invoked by event name: ${eventName}`
        );
    }

    if (!key) {
        throw new Error(`Event does not contain a valid S3 Object Key. Invoked with key: ${key}`);
    }

    const { Body: image, ContentType: type } = await get({ Key: key });

    const dimensions = imageSize(image);

    // convert it into a string.
    // const width = parseInt(maxWidth, 10);
    const width = parseInt(dimensions.width, 10);

    const aspectRatio = dimensions.width / dimensions.height;
    const height = [];

    // Width has to be an integer for sharp.
    const sizes = [];
    const sizesString = ["1_6", "1_4", "1_3", "1_2", "2_3", "1"];

    if (transformtype === "responsive") {
        sizes.push(width);
        sizes.push(Math.round(width * 1.5));
        sizes.push(width * 2);
        sizes.push(width * 3);
    } else {
        sizes.push(Math.round(width / 6));  // 1/6
        sizes.push(Math.round(width / 4));  // 1/4
        sizes.push(Math.round(width / 3));  // 1/3
        sizes.push(Math.round(width / 2));  // 1/2
        sizes.push(Math.round(width / 3) * 2);  // 2/3
        sizes.push(width);
    }

    sizes.map((wth) => {
        if (typeof maxHeight === 'undefined' || maxHeight === null) {
            height.push(Math.round(wth / aspectRatio));
        } else {
            height.push(Math.round(wth * (maxHeight / maxWidth)));
        }
        return wth;
    });

    console.log("sizes (widths): " + sizes);
    console.log("height: " + height);
    console.log("width: " + width);
    console.log("maxWidth: " + maxWidth);
    console.log("maxHeight: " + maxHeight);
    console.log("aspectRatio: " + aspectRatio);
    console.log("dimensions: " + dimensions.width + "/" + dimensions.height);
    console.log("transformtype: " + transformtype);

    const streams = await sharpify(image, imgconfig, sizes, height);
    const context = { key, type };

    return Promise.all(
        streams.map(async (stream, index) => {
            upload(stream, {
                ContentType: imageMimeTypes[(await stream.metadata()).format],
                ...params,
                Key: makeKey(fileNameKey, context, sizesString[index], outputdir),
            });
        })
    );
});
