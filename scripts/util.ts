import fs, {Dirent} from 'node:fs'
import path from 'node:path'

export const rawDataDir = path.resolve(import.meta.dirname, '../data-raw')
export const outputDir = path.resolve(import.meta.dirname, '../data')

export function getJsonFilesOfDirectory(): Dirent[] {
    return fs.readdirSync(rawDataDir, {withFileTypes: true})
        .filter((dirent, index) => dirent.isFile() && dirent.name.endsWith('.json'))
}

export function readJsonFile<T>(fileName: string, dir = rawDataDir): T {
    const file = path.resolve(dir, fileName)
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

export function readMap<T>(filename: string, dir = outputDir): Map<string, T> {
    const data = readJsonFile<Record<string, T>>(filename, dir)
    return new Map(Object.entries(data))
}

export function readArray<T>(filename: string, dir = outputDir): T[] {
    return readJsonFile<T[]>(filename, dir)
}

export function writeMap(data: Map<string, unknown>, name: string, dir = outputDir) {
    const file = path.resolve(dir, `${name}.json`)
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(data), null, 2))
}

export function writeArray(data: unknown[], name: string, dir = outputDir) {
    const file = path.resolve(dir, `${name}.json`)
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
}
