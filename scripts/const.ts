export const NODE_TYPE = {
    USER: 'user',
    ISSUE: 'issue',
    SPRINT: 'sprint',
    COMPONENT: 'component',
} as const

export type NodeType = (typeof NODE_TYPE)[keyof typeof NODE_TYPE]

export const EDGE_TYPE = {
    MENTION_PER_USER: 'mention_per_user',
    MENTION_PER_TICKET: 'mention_per_ticket',
    MENTION_PER_COMMENT: 'mention_per_comment',
    SPRINT_ISSUE :'sprint_issue',
    USER_ISSUE: 'user_issue',
    ISSUE_LINK: 'issue_link',
} as const

export type NodeSelection = {
    name: string
    type: NodeType
    filename: string
}

export const AVAILABLE_NODE_TYPES = {
    USER: {
        name: 'User',
        type: NODE_TYPE.USER,
        filename: 'users',
    },
    ISSUE: {
        name: 'Issues',
        type: NODE_TYPE.ISSUE,
        filename: 'issues',
    },
    SPRINT: {
        name: 'Sprints',
        type: NODE_TYPE.SPRINT,
        filename: 'sprints',
    },
    COMPONENT: {
        name: 'Components',
        type: NODE_TYPE.COMPONENT,
        filename: 'components',
    }
} as const satisfies Record<keyof typeof NODE_TYPE, NodeSelection>

export type EdgeType = (typeof EDGE_TYPE)[keyof typeof EDGE_TYPE]

export type EdgeSelection = {
    name: string
    type: EdgeType
    filename: string
    nodes: [NodeType, NodeType]
}

export const AVAILABLE_EDGES = {
    MENTION_PER_USER: {
        name: 'Mentions user -> user (general)',
        type: EDGE_TYPE.MENTION_PER_USER,
        filename: 'mentionPerUser',
        nodes: [NODE_TYPE.USER, NODE_TYPE.USER],
    },
    MENTION_PER_TICKET: {
        name: 'Mentions user -> user (per ticket)',
        type: EDGE_TYPE.MENTION_PER_TICKET,
        filename: 'mentionPerUserPerTicket',
        nodes: [NODE_TYPE.USER, NODE_TYPE.USER],
    },
    MENTION_PER_COMMENT: {
        name: 'Mentions user -> user (per comment)',
        type: EDGE_TYPE.MENTION_PER_COMMENT,
        filename: 'mentionPerUserPerComment',
        nodes: [NODE_TYPE.USER, NODE_TYPE.USER],
    },
    USER_ISSUE: {
        name: 'User <-> issue',
        type: EDGE_TYPE.USER_ISSUE,
        filename: 'userIssue',
        nodes: [NODE_TYPE.USER, NODE_TYPE.ISSUE],
    },
    SPRINT_ISSUE: {
        name: 'Sprint <-> issue',
        type: EDGE_TYPE.SPRINT_ISSUE,
        filename: 'sprintIssueEdges',
        nodes: [NODE_TYPE.SPRINT, NODE_TYPE.ISSUE],
    },
    ISSUE_LINK: {
        name: 'Issue <-> issue',
        type: EDGE_TYPE.ISSUE_LINK,
        filename: 'issueLinks',
        nodes: [NODE_TYPE.ISSUE, NODE_TYPE.ISSUE],
    }
} as const satisfies Record<keyof typeof EDGE_TYPE, EdgeSelection>
