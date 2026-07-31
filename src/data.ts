import type {ElementDefinition} from 'cytoscape'
// import mentions from '../data/commentMentions.json' with { type: 'json'}
// import components from '../data/components.json' with { type: 'json'}
// import issueLinkTypes from '../data/issueLinkTypes.json' with { type: 'json'}
// import issues from '../data/issues.json' with { type: 'json'}
// import links from '../data/links.json' with { type: 'json'}
// import sprints from '../data/sprints.json' with { type: 'json'}
// import statuses from '../data/statuses.json' with { type: 'json'}
// import types from '../data/types.json' with { type: 'json'}
import users from '../data/users.json' with { type: 'json'}

export const usersForCytoscape = Object.values(users).map<ElementDefinition>(user => ({
   group: 'nodes',
   data: {
       id: user.key,
       displayName: user.displayName,
   }
}))

export const AVAILABLE_MENTIONS = [{
    name: 'mentions by user',
    file: 'mentionPerUser',
}, {
    name: 'mentions by user per ticket',
    file: 'mentionPerUserPerTicket',
}, {
    name: 'mentions by user per ticket & per comment',
    file: 'mentionPerUserPerTicketPerComment',
}]

export async function loadData(file: string): Promise<ElementDefinition[]> {
    const data = await import(`../data-simplified/${file}.json`, { with: { type: 'json' } })
    return data.default as ElementDefinition[]
}
