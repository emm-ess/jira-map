import fs, {Dirent} from 'node:fs'
import path from 'node:path'

export const rawDataDir = path.resolve(import.meta.dirname, '../data-raw')
export const additionalDataDir = path.resolve(import.meta.dirname, '../data-additional')
export const dataDir = path.resolve(import.meta.dirname, '../data')
export const simplifiedDataDir = path.resolve(import.meta.dirname, '../data-simplified')

export function getJsonFilesOfDirectory(): Dirent[] {
    return fs.readdirSync(rawDataDir, {withFileTypes: true})
        .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.json'))
}

export function readJsonFile<T extends {}>(fileName: string, dir = rawDataDir): T {
    const file = path.resolve(dir, fileName)
    return fs.existsSync(file)
        ? JSON.parse(fs.readFileSync(file, 'utf-8'))
        : {}
}

export function readMap<T>(filename: string, dir = dataDir): Map<string, T> {
    const data = readJsonFile<Record<string, T>>(filename, dir)
    return new Map(Object.entries(data))
}

export function readArray<T>(filename: string, dir = dataDir): T[] {
    return readJsonFile<T[]>(filename, dir)
}

function ensureDir(filename: string): void {
    const dirname = path.dirname(filename)
    fs.mkdirSync(dirname, {recursive: true})
}

export function writeMap(data: Map<string, unknown>, name: string, dir = dataDir) {
    const file = path.resolve(dir, `${name}.json`)
    ensureDir(file)
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(data), null, 2))
}

export function writeArray(data: unknown[], name: string, dir = dataDir) {
    const file = path.resolve(dir, `${name}.json`)
    ensureDir(file)
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

export function unique<T>(values: T[]): T[] {
    return [...new Set(values)].filter(Boolean)
}
