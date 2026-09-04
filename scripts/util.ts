import type {Dirent} from 'node:fs'
import fs from 'node:fs'
import path from 'node:path'

export const rawDataDir = path.resolve(import.meta.dirname, '../data-raw')
export const additionalDataDir = path.resolve(import.meta.dirname, '../data-additional')
export const dataDir = path.resolve(import.meta.dirname, '../data')
export const preparedDataDir = path.resolve(import.meta.dirname, '../data-prepared')

export function getJsonFilesOfDirectory(): Dirent[] {
    return fs.readdirSync(rawDataDir, {withFileTypes: true})
        .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.json'))
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function readJsonFile<T extends object>(fileName: string, dir = rawDataDir): T {
    const file = path.resolve(dir, fileName)
    return fs.existsSync(file)
        ? JSON.parse(fs.readFileSync(file, 'utf8'))
        : {} as T
}

export function readMap<Key extends string | number, Value>(filename: string, dir = dataDir, keyToNumber = false): Map<Key, Value> {
    const data = readJsonFile<Record<Key, Value>>(filename, dir)
    const entries = keyToNumber
        ? Object.entries(data).map(([k, v]) => [Number(k), v])
        : Object.entries(data)
    // @ts-expect-error just for now
    return new Map<Key, Value>(entries)
}

export function readArray<T>(filename: string, dir = dataDir): T[] {
    return readJsonFile<T[]>(filename, dir)
}

function ensureDir(filename: string): void {
    const dirname = path.dirname(filename)
    fs.mkdirSync(dirname, {recursive: true})
}

export function writeMap(data: Map<string | number, unknown>, name: string, dir = dataDir) {
    const file = path.resolve(dir, `${name}.json`)
    ensureDir(file)
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(data), undefined, 2))
}

export function writeArray(data: unknown[], name: string, dir = dataDir) {
    const file = path.resolve(dir, `${name}.json`)
    ensureDir(file)
    fs.writeFileSync(file, JSON.stringify(data, undefined, 2))
}

export function unique<T>(values: T[]): T[] {
    return [...new Set(values)].filter(Boolean)
}
