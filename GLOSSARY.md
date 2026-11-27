# Sheets Ecosystem Map

A map of an organisation's spreadsheets: which Department owns which Sheets, how data flows between them, and the work (Tickets, Flows) that surrounds them.

## Language

**Department**:
A named group on the map that owns Sheets, split into Functions, with a description and Members. A Department is a Team that also appears on the map.
_Avoid_: Column, group

**Function**:
One thing a Department does (a process), grouping the Sheets used for it, with an optional description (the yellow block on the map). Stored as a `section` in the Data file.
_Avoid_: Section (in the app), Procedure, note card

**Member**:
A person in a Department, with a role and an optional email. The Owner of a Sheet is chosen from them but stored as plain text.
_Avoid_: User, employee

**Card**:
Anything drawn on the map that can be selected and linked: a Sheet or an App.
_Avoid_: Node, box

**Sheet**:
A spreadsheet or other file that belongs to one Department and one Function, with an owner, a criticality, an optional type (Google Sheet by default, or Doc, Excel, PDF, Other) and documentation links. Its current tickets are the open Tickets whose Target it is; they are never stored on it.
_Avoid_: Spreadsheet, doc

**App**:
A connected system that is not a Sheet, such as a CRM or Slack, and belongs to no Department.
_Avoid_: Tool, integration, connected app

**Link**:
A directed data flow from one Card to another, with a method such as IMPORTRANGE.
_Avoid_: Connection, arrow, dependency

**Automatic / Manual**:
Whether a Link moves data on its own or a person copies it by hand.
_Avoid_: Auto, scripted

**Team**:
Whoever performs a step in a Flow. It may or may not be a Department.
_Avoid_: Lane, group

**Hand-off**:
Work passing from one Team to another inside a Flow. It is not a Link.
_Avoid_: Link, connection

**Brief**:
The text a person writes about a Flow for AI to work from: what the process is for, who is involved and what goes wrong today. An optional rough **draft** of the steps can go with it. Both are saved on the Flow and can be edited and used again.
_Avoid_: Prompt, description (a Department or Function has a description)

**Layout**:
How a Flow is drawn. A **swimlane** Flow has a lane per Team; a **free canvas** Flow is boxes placed by hand, with no lanes. A swimlane can become a free canvas, never the other way.
_Avoid_: View, mode

**Entity box**:
A box on a free canvas with a name and description lines, and optionally a Sheet it stands for. A relationship between two is a labelled arrow.
_Avoid_: Table, class

**Target**:
The Card or Department a Ticket is about.
_Avoid_: Linked to

## Storage

**Entry**:
One item the app keeps: a Sheet, App, Link, Ticket, Flow or Flow step. When someone says "my records", they mean Entries.
_Avoid_: Record, row, item

**Data file**:
The stored file that holds the Entries of one map. The app is its only editor; people read exports of it.
_Avoid_: Record, database, document

**Snapshot**:
A copy of a Data file taken just before a save replaces it, so any earlier state can be recovered.
_Avoid_: Backup, version

**Base hash**:
The fingerprint of a Data file as the page loaded it. A save sends it back; if the file has changed since, the save is refused.
_Avoid_: ETag, version number

**Removed**:
An Entry the user deleted. It stays restorable until the user purges it.
_Avoid_: Trash, archived, soft-deleted

**Export**:
A document generated from the Entries for people to read or share, such as a Markdown map document, a ticket report or a flow document. An Export is never edited and never read back.
_Avoid_: Report, download
