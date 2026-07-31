import type {DataRaw} from './data-raw'

declare namespace Data {
    // User
    //------------------
    export type User = Pick<DataRaw.User, 'key' | 'avatarUrls' | 'displayName' | 'name'> & {
        combine?: string[]
    }

    export type UserFile = {
        /** key is field `key` of user */
        [key: string]: User[]
    }

    // Sprint
    //------------------
    export type Sprint = {
        id: string
        sequence: number
        name: string
        goal?: string
        state: string
        startDate?: string
        endDate?: string
        activatedDate?: string
        completeDate?: string
    }

    export type SprintFile = {
        /** id is field `id` of Sprint */
        [id: string]: Sprint[]
    }

    // Components
    //------------------
    export type Component = Omit<DataRaw.ProjectComponent, 'self'>

    export type ComponentFile = {
        /** id is field `id` of Component */
        [id: string]: Component[]
    }

    // IssueLink
    //------------------
    export type LinkedIssue = {
        /** The ID of the issue. */
        id: string;
        /** The ID of the issueType. */
        issuetype: string
    }

    export type IssueLinkType = Omit<DataRaw.IssueLinkType, 'self'>

    export type IssueLink = {
        /** The ID of the issue link. */
        id: string;
        inwardIssue?: LinkedIssue;
        outwardIssue?: LinkedIssue;
        /** The ID of the IssueLinkType. */
        type: string;
    }

    export type IssueLinkFile = {
        /** id is field `id` of IssueLink */
        [id: string]: IssueLink[]
    }

    // Issue-Status
    //------------------
    export type StatusCategory = Omit<DataRaw.StatusCategory, 'self'>
    export type Status = Omit<DataRaw.Status, 'self' | 'iconUrl' | 'statusCategory'> & {
        statusCategory: StatusCategory
    }

    export type StatusFile = {
        /** id is field `id` of Status */
        [id: string]: Status[]
    }

    // Issue-Type
    //------------------
    export type IssueType = Pick<DataRaw.IssueType, 'id' | 'name' | 'subtask'>

    export type IssueTypeFile = {
        /** id is field `id` of IssueType */
        [id: string]: IssueType[]
    }

    // Issue
    //------------------
    export type Comment = Omit<DataRaw.Comment, 'self' | 'author' | 'updateAuthor'> & {
        /** The key of the user */
        author: string
        /** The key of the user */
        updateAuthor?: string
        /** The key of the users. If user couldn't be found it will be the name of the user. */
        mentionedUsers: string[]
    }

    export type IssueChangelogHistory = Omit<DataRaw.IssueChangelogHistory, 'author'> & {
        /** The key of the user */
        author: string
    }

    export type Issue = {
        /** The ID of the issue. */
        id: string;
        /** The key of the issue. */
        key: string;
        summary: string;
        /** Id of the issueType */
        issuetype: string;
        lastViewed: string | null
        /** Ids of the components */
        components: string[]
        /** Ids of the subtasks */
        subtasks: string[]
        created: string;
        description: string | null;
        /** The key of the user */
        reporter: string;
        /** Story-Punkte (in float) */
        storypoints?: number
        /** Sprint */
        sprints?: string[]
        comments: Comment[]
        issuelinks: string[];
        /** The key of the user */
        assignee: string;
        updated: string
        /** Id of the status */
        status: string;
        changelog: IssueChangelogHistory[];

        /** The keys of the users. If user couldn't be found it will be the name of the user. */
        mentionedUsers: string[]
        /** The keys of the users */
        assignedUsers: string[]
    }
}
