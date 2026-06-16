# Hakanban automation cookbook

Recipes for driving Hakanban from Home Assistant automations and scripts, and reacting to what
happens on a board. Every event, service and field used here is defined in
[PROTOCOL.md](PROTOCOL.md) — the source of truth.

Throughout, replace the `<...>` placeholders with real ids. You can find ids from the panel,
from `./scripts/ha states todo` (a column entity's `unique_id` is `{board_id}_{column_id}`), or
by listening to the bus events below — `hakanban_card_created` carries `board_id`, `column_id`
and `card_id`.

**Quick reference**

Events: `hakanban_card_created`, `hakanban_card_updated`, `hakanban_card_moved`,
`hakanban_card_completed`, `hakanban_card_deleted`, `hakanban_board_changed`.

Services: `hakanban.add_card`, `hakanban.move_card`, `hakanban.update_card`,
`hakanban.add_comment`, `hakanban.create_board`, `hakanban.create_column`.

---

## 1. Notify when a card reaches "Done"

Trigger on `hakanban_card_moved` and match the destination column.

```yaml
automation:
  - alias: "Hakanban: notify on card done"
    triggers:
      - trigger: event
        event_type: hakanban_card_moved
        event_data:
          to_column: <done_column_id>
    actions:
      - action: notify.mobile_app_neil
        data:
          title: "Kanban — Done"
          message: "Card {{ trigger.event.data.card_id }} moved to Done."
```

`hakanban_card_moved` data: `board_id`, `card_id`, `from_column`, `to_column`.

> Prefer reacting to *completion* rather than a specific column? Trigger on
> `hakanban_card_completed` (`board_id`, `card_id`, `column_id`) instead — that fires whenever a
> card's status flips to `completed`, including via the native To-do card or Assist.

---

## 2. Add a card when the doorbell rings

Use `hakanban.add_card` to capture something into a "Follow up" list from any trigger.

```yaml
automation:
  - alias: "Doorbell → Follow up card"
    triggers:
      - trigger: state
        entity_id: binary_sensor.front_doorbell
        to: "on"
    actions:
      - action: hakanban.add_card
        data:
          board_id: <board_id>
          column_id: <follow_up_column_id>
          title: "Doorbell rang at {{ now().strftime('%H:%M') }}"
          description: "Check the Ring snapshot and follow up if needed."
          labels:
            - red
          due: "{{ (now() + timedelta(hours=2)).isoformat() }}"
```

`hakanban.add_card` fields: `board_id`, `column_id`, `title`, `description?`, `labels?`, `due?`.

---

## 3. Nightly script: build a "Shopping" column from a to-do list

A script that turns the items of another `todo` list (e.g. a quick "Shopping ideas" list) into
Hakanban cards each night, then clears the source. This shows `hakanban.add_card` driven from a
template loop.

```yaml
script:
  hakanban_nightly_shopping:
    alias: "Hakanban: nightly shopping cards"
    sequence:
      - action: todo.get_items
        target:
          entity_id: todo.shopping_ideas
        data:
          status: needs_action
        response_variable: ideas
      - repeat:
          for_each: "{{ ideas['todo.shopping_ideas']['items'] }}"
          sequence:
            - action: hakanban.add_card
              data:
                board_id: <board_id>
                column_id: <shopping_column_id>
                title: "{{ repeat.item.summary }}"
                labels:
                  - green
            - action: todo.remove_item
              target:
                entity_id: todo.shopping_ideas
              data:
                item: "{{ repeat.item.summary }}"
```

Schedule it with a time automation:

```yaml
automation:
  - alias: "Hakanban: run nightly shopping at 22:00"
    triggers:
      - trigger: time
        at: "22:00:00"
    actions:
      - action: script.hakanban_nightly_shopping
```

Because each Hakanban column **is** a `todo` entity, you could equally skip the service and call
`todo.add_item` straight onto `todo.<shopping_column>` — same data, same result.

---

## 4. Mark a chore card complete when a motion sensor confirms it

When motion in the utility room confirms the laundry got done, find the matching card and flip
its status to `completed` with `hakanban.update_card`. (Here the card id is known — capture it
once from `hakanban_card_created` into an `input_text`, or hard-code a long-lived chore card.)

```yaml
automation:
  - alias: "Laundry done → complete chore card"
    triggers:
      - trigger: state
        entity_id: binary_sensor.utility_motion
        to: "on"
        for:
          minutes: 2
    actions:
      - action: hakanban.update_card
        data:
          card_id: "{{ states('input_text.laundry_card_id') }}"
          status: completed
      - action: hakanban.add_comment
        data:
          card_id: "{{ states('input_text.laundry_card_id') }}"
          text: "Auto-completed: confirmed by utility motion."
```

`hakanban.update_card` accepts `card_id` plus any of the card fields (`title`, `description`,
`labels`, `assignees`, `due`, `due_complete`, `status`, `cover`, `archived`). Setting `status`
to `completed` also fires `hakanban_card_completed`. `hakanban.add_comment` takes `card_id` and
`text` (comments authored by automations show as "Home Assistant").

---

## 5. Move a card across the board from an automation

Promote a card from "Doing" to "Review" — for example when a build finishes — with
`hakanban.move_card`.

```yaml
automation:
  - alias: "Build finished → move card to Review"
    triggers:
      - trigger: state
        entity_id: binary_sensor.ci_build
        to: "off"
    actions:
      - action: hakanban.move_card
        data:
          card_id: <card_id>
          to_column: <review_column_id>
          position: 0          # drop it at the top of the column
```

`hakanban.move_card` fields: `card_id`, `to_column`, `position?`. Omit `position` to append to
the end of the target column. This fires `hakanban_card_moved`, so it can chain into recipe 1.

---

## 6. Spin up a board column from a script

Provision structure on the fly — e.g. add a "This week" column to a board at the start of each
week — with `hakanban.create_column` (and `hakanban.create_board` if you need a whole new
board).

```yaml
script:
  hakanban_weekly_column:
    alias: "Hakanban: add weekly column"
    sequence:
      - action: hakanban.create_column
        data:
          board_id: <board_id>
          title: "Week of {{ now().strftime('%d %b') }}"
```

```yaml
automation:
  - alias: "Hakanban: new weekly column every Monday"
    triggers:
      - trigger: time
        at: "06:00:00"
    conditions:
      - condition: time
        weekday:
          - mon
    actions:
      - action: script.hakanban_weekly_column
```

`hakanban.create_column` fields: `board_id`, `title`. `hakanban.create_board` takes just
`title`. Either one fires `hakanban_board_changed` (`board_id`, `action`), which you can use to
trigger follow-up automations.

---

## Notes

- **Triggering on board structure changes:** `hakanban_board_changed` fires for board/column/
  label create/update/delete with an `action` string (e.g. `created`, `column_created`,
  `column_moved`, `label_deleted`). Match on `event_data.action` to react to a specific change.
- **`hakanban_card_updated`** fires on edits and on adding a comment (`action: comment_added`);
  it carries `board_id`, `card_id`, and optionally `column_id` and `action`.
- **Native `todo.*` works too:** because every column is a `todo` entity, `todo.add_item`,
  `todo.update_item` and `todo.remove_item` on `todo.<board>_<column>` mutate the same cards —
  handy for Assist and voice flows.
