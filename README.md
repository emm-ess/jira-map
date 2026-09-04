# Jira-Map

This is a small project/tool to generate a visual representation of a project management with Jira as a ticketing 
tool. The foal is to generate a ma / network graph in the style of a transit map like for public transportation. The 
thought behind this is to show the contribution of each team member to the project as some kind of thankfulness and 
teambuilding after the project is done.

At the moment it's a very messy code-base. It's on purpose to explore how to great such a transport diagram with 
[Cytoscape.js](js.cytoscape.org) and the given data. Once the state of the project is more stable, the code will be 
cleaned up and refactored. For now it's more like a proof of concept, a playground and move-fast-and-break-things.

## Structure

### `./scripts/`

Contains several scripts for normalizing and preparing the data exported from Jira.

Stack: TypeScript


### `./src/`

Contains the main application, which is a basic and straight forward tool at the moment. Its interface allows 
the selection of different data-sets as well as the selection of the graph layout and highlighted nodes.

Stack: Vue, TypeScript, Sass

### `./src/graph/`

This is the heart of the application. It contains the logic for graph generation logic and layouting.

Stack: [Cytoscape.js](js.cytoscape.org), TypeScript
