import { SCHEMA_VERSION, SEGMENT_KINDS, SESSION_EVENT_TYPES } from './types.ts'

const seconds = { type: 'integer', minimum: 0 }
const timestamp = { type: 'string', minLength: 1 }
const idWithPrefix = (prefix: string) => ({ type: 'string', pattern: `^${prefix}[a-z0-9]{1,16}$` })

// Unknown fields are allowed everywhere so a file written by a newer minor version
// round-trips (spec §3: never silently drop unknown fields).
export const projectSchema = {
  $id: 'https://oversay.app/schema/project-v1.json',
  type: 'object',
  required: ['schemaVersion', 'id', 'name', 'talks'],
  properties: {
    schemaVersion: { const: SCHEMA_VERSION },
    id: idWithPrefix('p_'),
    name: { type: 'string' },
    description: { type: 'string' },
    talks: { type: 'array', items: { $ref: '#/$defs/talk' } },
  },
  $defs: {
    talk: {
      type: 'object',
      required: ['id', 'name', 'segments', 'sessions'],
      properties: {
        id: idWithPrefix('t_'),
        name: { type: 'string' },
        description: { type: 'string' },
        audience: { type: 'string' },
        targetSeconds: seconds,
        segments: { type: 'array', items: { $ref: '#/$defs/segment' } },
        sessions: { type: 'array', items: { $ref: '#/$defs/session' } },
      },
    },
    segment: {
      type: 'object',
      required: ['id', 'name', 'kind', 'plannedSeconds', 'openEnded', 'points', 'hints'],
      properties: {
        id: idWithPrefix('s_'),
        name: { type: 'string' },
        kind: { enum: [...SEGMENT_KINDS] },
        plannedSeconds: seconds,
        openEnded: { type: 'boolean' },
        points: { type: 'array', items: { type: 'string' } },
        hints: { type: 'array', items: { type: 'string' } },
      },
    },
    session: {
      type: 'object',
      required: ['id', 'startedAt', 'plan', 'events'],
      properties: {
        id: idWithPrefix('r_'),
        startedAt: timestamp,
        endedAt: timestamp,
        plan: {
          type: 'array',
          items: {
            type: 'object',
            required: ['segmentId', 'name', 'plannedSeconds', 'openEnded'],
            properties: {
              segmentId: idWithPrefix('s_'),
              name: { type: 'string' },
              plannedSeconds: seconds,
              openEnded: { type: 'boolean' },
            },
          },
        },
        events: {
          type: 'array',
          items: {
            type: 'object',
            required: ['at', 'type'],
            properties: { at: timestamp, type: { enum: [...SESSION_EVENT_TYPES] } },
          },
        },
      },
    },
  },
} as const
