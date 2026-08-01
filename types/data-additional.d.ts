/**
 * These datatypes are used for additional information provided by the user to enrich the jira export.
 */
export namespace DataAdditional {
    export type UserMeta = {
        /** key of user as in DataRaw.User['key'] */
        combine?: string[]
        /** whether the user should be ignored and can be safely removed/handeled as "non existing" */
        hide?: boolean
    }

    export type UserMetaFile = {
        /** key is field `key` of user */
        [key: string]: UserMeta[]
    }

    export type IssueMeta = {
        /** ids of components */
        components?: string[]
        /** stuff like "Verbindungssuche", "Bahnhofstafel", "Zugdetails", "API", ... */
        area?: string[]
        hide?: boolean
        duplicatedBy?: string[]
        duplicateOf?: string
    }

    export type IssueMetaFile = {
        /** id is field `id` of issue */
        [id: string]: IssueMeta[]
    }

    /**
     * PredictionMeta helps to find the area of the issue.
     * It's a simple keyword -> area(s) mapping.
     */
    export type PredictionMetaFile = Record<string, string[]>
}
