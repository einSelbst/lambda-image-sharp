// @ts-check
import processItem from './image'

export async function processImage ({ Records: records }, context, callback) {
  try {
    await Promise.all(records.map(processItem))
  } catch (error) {
    console.error(error)
    return callback(error, { records })
  }

  console.log(`Completed processing ${records.length} event${records.length === 1 ? '' : 's'}`)

  return callback(null)
}
