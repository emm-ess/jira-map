import type {Position} from 'cytoscape'
import type {FcoseRelativePlacementConstraint} from 'cytoscape-fcose'
import {describe, expect, it} from 'vitest'

import {
    centroid,
    type Constraints,
    mergeConstraints,
    nearestDirection,
    RESTRICTION_ORDERS,
    type RestrictionOrder,
    sortRestrictions,
} from '@/graph/layoutHelper.ts'

type Groups = string[][]
const constraints = (horizontal: Groups = [], vertical: Groups = [], relativePlacementConstraint: FcoseRelativePlacementConstraint[] = []): Constraints =>
    ({alignmentConstraint: {horizontal, vertical}, relativePlacementConstraint})
/** Every node is known and sits on the same spot unless `where` says otherwise. */
const merge = (sets: Constraints[], where: Record<string, Position> = {}) =>
    mergeConstraints(sets, (id) => where[id] ?? {x: 0, y: 0})
const sorted = (groups: Groups = []) => groups.map((group) => group.toSorted()).toSorted((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''))
const describePlacements = (placements: FcoseRelativePlacementConstraint[]) => placements.map((placement) => 'left' in placement
    ? `${placement.left}<${placement.right}`
    : `${placement.top}^${placement.bottom}`).toSorted()
const mentionedIds = (merged: Constraints) => [
    ...(merged.alignmentConstraint.horizontal ?? []).flat(),
    ...(merged.alignmentConstraint.vertical ?? []).flat(),
    ...merged.relativePlacementConstraint.flatMap((placement) => 'left' in placement
        ? [placement.left, placement.right]
        : [placement.top, placement.bottom]),
]

describe('mergeConstraints', () => {
    it('merges overlapping alignment groups and drops singletons and empty groups', () => {
        const merged = merge([constraints([['a', 'b'], ['b', 'c'], ['x']]), constraints([['c', 'd'], []])])

        expect(sorted(merged.alignmentConstraint.horizontal)).toEqual([['a', 'b', 'c', 'd']])
        expect(merged.alignmentConstraint.vertical).toEqual([])
    })

    it('skips a group that would stack two stations on one point; the earlier set wins', () => {
        const direct = merge([constraints([['a', 'b']]), constraints([], [['a', 'b']])])
        expect(direct.alignmentConstraint.vertical).toEqual([])
        expect(sorted(direct.alignmentConstraint.horizontal)).toEqual([['a', 'b']])

        // b, c share x and a, b share y; a, c sharing y too would put all three on one point
        const transitive = merge([constraints([['a', 'b']], [['b', 'c']]), constraints([['a', 'c']])])
        expect(transitive.alignmentConstraint.horizontal?.map((group) => group.toSorted())).toEqual([['a', 'b']])
    })

    it('drops placements that contradict each other or the alignments', () => {
        const cycle = merge([constraints([], [], [{left: 'a', right: 'b', gap: 1}, {left: 'b', right: 'c', gap: 1}, {left: 'c', right: 'a', gap: 1}])])
        expect(cycle.relativePlacementConstraint, 'left/right cycle: the last one goes').toHaveLength(2)

        const sameColumn = merge([constraints([], [['a', 'b']], [{left: 'a', right: 'b', gap: 1}, {top: 'a', bottom: 'b', gap: 1}])])
        expect(sameColumn.relativePlacementConstraint, 'left/right between nodes in one column is impossible').toEqual([{top: 'a', bottom: 'b', gap: 1}])

        const contradiction = merge([constraints([], [], [{top: 'a', bottom: 'b'}, {top: 'b', bottom: 'a'}])])
        expect(contradiction.relativePlacementConstraint).toHaveLength(1)

        const throughClass = merge([constraints([['b', 'c']], [], [{top: 'a', bottom: 'b'}, {top: 'c', bottom: 'a'}])])
        expect(throughClass.relativePlacementConstraint.filter((placement) => 'top' in placement), 'cycle through an alignment class').toHaveLength(1)
    })

    it('returns nothing for nothing', () => {
        expect(merge([]).alignmentConstraint).toEqual({horizontal: [], vertical: []})
    })

    it('orders stations aligned on one axis along it, where nothing orders them yet', () => {
        const where = {a: {x: 0, y: 0}, b: {x: 30, y: 0}, c: {x: 10, y: 0}, d: {x: 20, y: 0}}
        const merged = merge([
            constraints([['a', 'b']], [], [{left: 'a', right: 'b', gap: 10}]),
            constraints([['c', 'd'], ['b', 'c']], [], [{left: 'c', right: 'd', gap: 10}]),
        ], where)

        expect(sorted(merged.alignmentConstraint.horizontal)).toEqual([['a', 'b', 'c', 'd']])
        // kept: a<b, c<d; added by position: a<c (0 < 10), d<b (20 < 30)
        expect(describePlacements(merged.relativePlacementConstraint)).toEqual(['a<b', 'a<c', 'c<d', 'd<b'])

        const column = merge([constraints([], [['p', 'q', 'r']])], {p: {x: 0, y: 5}, q: {x: 0, y: 1}, r: {x: 0, y: 3}})
        expect(describePlacements(column.relativePlacementConstraint), 'top to bottom by y').toEqual(['q^r', 'r^p'])
    })

    it('drops stations that no longer exist from everything (fcose never returns for unknown ids)', () => {
        const alive = new Set(['a', 'b', 'c'])
        const merged = mergeConstraints([constraints(
            [['a', 'b', 'ghost'], ['ghost', 'other']],
            [['b', 'c']],
            [{left: 'a', right: 'ghost', gap: 5}, {top: 'ghost', bottom: 'c'}, {left: 'a', right: 'c', gap: 5}],
        )], (id) => alive.has(id)
            ? {x: 0, y: 0}
            : undefined)

        expect(mentionedIds(merged).length).toBeGreaterThan(0)
        expect(mentionedIds(merged).filter((id) => !alive.has(id))).toEqual([])
    })

    it('lets the resolve order decide which restriction of a cycle gets dropped', () => {
        const where: Record<string, Position> = {p: {x: 0, y: 0}, q: {x: 0, y: 50}, r: {x: 0, y: 100}}
        const cycle = constraints([], [], [{left: 'p', right: 'q', gap: 1}, {left: 'q', right: 'r', gap: 1}, {left: 'r', right: 'p', gap: 1}])
        const kept = (order: RestrictionOrder) => describePlacements(mergeConstraints([cycle], (id) => where[id], order).relativePlacementConstraint)

        // midpoints: p<q y 25, q<r y 75, r<p y 50
        expect(kept('as-computed')).toEqual(['p<q', 'q<r'])
        expect(kept('top-to-bottom')).toEqual(['p<q', 'r<p'])
        expect(kept('bottom-to-top')).toEqual(['q<r', 'r<p'])
    })
})

describe('sortRestrictions', () => {
    const items = [{id: 'a', p: {x: 5, y: 30}}, {id: 'b', p: {x: 1, y: 20}}, {id: 'c', p: {x: 9, y: 10}}, {id: 'd', p: undefined}]
    const ids = (list: typeof items) => list.map((item) => item.id).join('')
    const anchor = (item: (typeof items)[number]) => item.p

    it('orders by the anchor position (no position counts as 0) and never changes its input', () => {
        const copy = structuredClone(items)

        expect(sortRestrictions(items, anchor, 'as-computed')).toBe(items)
        expect(ids(sortRestrictions(items, anchor, 'top-to-bottom'))).toBe('dcba')
        expect(ids(sortRestrictions(items, anchor, 'bottom-to-top'))).toBe('abcd')
        expect(ids(sortRestrictions(items, anchor, 'left-to-right'))).toBe('dbac')
        expect(ids(sortRestrictions(items, anchor, 'right-to-left'))).toBe('cabd')
        expect(items).toEqual(copy)
    })

    it('shuffles into a permutation for "random"', () => {
        const shuffled = sortRestrictions(items, anchor, 'random')
        expect(shuffled.map((item) => item.id).toSorted().join('')).toBe('abcd')
        expect(RESTRICTION_ORDERS).toHaveLength(6)
    })
})

describe('centroid', () => {
    it('ignores unknown points', () => {
        expect(centroid([])).toBeUndefined()
        expect(centroid([undefined])).toBeUndefined()
        expect(centroid([{x: 0, y: 0}, undefined, {x: 4, y: 2}])).toEqual({x: 2, y: 1})
    })
})

describe('nearestDirection', () => {
    it.each([
        [10, 0, 1, 0],
        [10, 10, 1, 1],
        [0, 10, 0, 1],
        [-10, 10, -1, 1],
        [-10, 0, -1, 0],
        [-10, -10, -1, -1],
        [0, -10, 0, -1],
        [10, -10, 1, -1],
        [10, 3, 1, 0],
        [3, 10, 0, 1],
        [-10, 4, -1, 0],
        [10, 9, 1, 1],
    ])('snaps (%d, %d) to the compass direction (%d, %d)', (x, y, expectedX, expectedY) => {
        expect(nearestDirection({x: 0, y: 0}, {x, y})).toEqual({x: expectedX, y: expectedY})
    })
})
