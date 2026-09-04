import type {Data} from './data'

export namespace DataPrepared {
    export type StationId = `${string}-station-${number}`
    export type LineId = `${string}-segment-${number}`

    export type IntersectionElement = {
        group: 'nodes'
        data: IntersectionData
    }

    export type IntersectionData = {
        type: 'intersection'
        id: string
        lines: string[]
        issues: string[]
        children: string[]
    }

    export type Station = {
        type: 'station'
        future: boolean
        line: string
        id: StationId
        sprintId: number
        sprintNumber?: number
        // number of sprint for now
        name: string
        assignedUsers: string[]
        mentionedUsers: string[]
        areas: string[]
        issues: string[]
    }

    export type LineSegment = {
        type: 'segment'
        future: boolean
        line: string
        id: LineId
        source: StationId
        target: StationId
        /** based on number of sprint between source and target */
        distance: number
    }

    export type Issue = Omit<Data.Issue, 'changelog'> & {
        area?: string[]
    }

    export type LineInfo = {
        name: string
        handPickedColor: boolean
        filename: string
        colorNormal: string
        colorUnused: string
    }
}
