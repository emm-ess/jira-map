import type {Data} from './data'

export namespace DataPrepared {
    export type StationId = `${string}-station-${number}`
    export type LineId = `${string}-segment-${number}`

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
        issues: Data.Issue[]
    }

    export type LineSegment = {
        type: 'segment'
        future: boolean
        area: string
        id: LineId
        source: StationId
        target: StationId
        /** based on number of sprint between source and target */
        distance: number
    }
}
