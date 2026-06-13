# Scenario File Concept

The first persistence feature is exact round-trip export/import. The app should be able to save a planning scenario to a native file and reload it without losing information.

## Goals

- Persist the portfolio plan outside browser storage.
- Support exact reload of projects, squads, milestones, assignments, settings, and scenario notes.
- Make the format versioned so future migrations are possible.
- Keep stakeholder/staff-allocation exports out of the first implementation.

## Time Addressing

Planning bars use sprint addresses:

```text
YY-PI-SPRINT
```

Example:

```text
26-4-3
```

This means Calendar Year 2026, PI 4, Sprint 3.

Each PI has four sprint positions: `1`, `2`, `3`, `4`.

## Draft Shape

```json
{
  "schemaVersion": 1,
  "scenario": {
    "id": "sample-scenario",
    "name": "Baseline portfolio sequence",
    "createdAt": "2026-06-13T00:00:00Z",
    "updatedAt": "2026-06-13T00:00:00Z"
  },
  "calendar": {
    "financialYearStartMonth": 7,
    "piCountPerCalendarYear": 4,
    "sprintsPerPi": 4
  },
  "squads": [
    {
      "id": "squad-a",
      "name": "Squad A",
      "capacityFte": 8
    }
  ],
  "projects": [
    {
      "id": "program-orion",
      "name": "Program Orion",
      "effortFteYears": 5,
      "eligibleSquadIds": ["squad-a"],
      "milestones": [
        {
          "id": "orion-integration",
          "name": "Integration checkpoint",
          "dateKey": "26-3-2"
        }
      ]
    }
  ],
  "assignments": [
    {
      "id": "assign-orion-a",
      "projectId": "program-orion",
      "squadId": "squad-a",
      "startKey": "26-1-1",
      "endKey": "26-2-4"
    }
  ]
}
```

## Non-Goals For First Version

- Spreadsheet import/export.
- Staff-level allocation export.
- Browser-only persistence.
- Arbitrary day/week scheduling.
