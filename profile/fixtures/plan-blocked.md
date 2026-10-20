# Fixture plan

- **Date:** 2026-01-01
- **Slug:** fixture
- **Status:** draft
- **Stages:** jar-implementer | jar-verifier

## What this does

A small change to how the weather answer is tidied. Laptop and phone behave the same, on mobile and desktop alike.

## How I'll build it

1. One field is added to the answer.

## How you'll know it worked

- The answer carries the new field.

## Technical detail

## Idea

A fixture for the preflight check script.

## Context

The handler tidies the vendor answer.

## Files to change

| File | Change |
|---|---|
| `api/weather.js` | the field |

## New files

None.

## Steps

1. Add a field to `api/weather.js`.

## Risks & footguns

None.

## Test plan

- `npm test` passes.

## Acceptance criteria

- [ ] `npm test` exits 0

## Out of scope

Anything else.
