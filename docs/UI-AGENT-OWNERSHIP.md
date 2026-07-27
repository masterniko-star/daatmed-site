# UI-AGENT-OWNERSHIP — реестр владения UI-блоками между Claude Code и ChatGPT/Codex

> Правило, которое ведёт этот файл: `AGENTS.md` §23 (введено владельцем 2026-07-26).
> В отличие от `docs/BLOCK-INDEX.md` (машинно-генерируемая карта блоков), этот файл —
> лёгкий, ручной реестр **кто сейчас работает над каким блоком интерфейса**. Не карта
> архитектуры — карта текущей занятости.

## Как вести

- Берёшь блок в работу → добавляешь строку (или обновляешь существующую) ДО первого
  коммита в блок: блок, среда, ветка, дата начала, статус `active`.
- Заканчиваешь/сливаешь → меняешь статус на `done` (строку не удалять — история пересечений).
- Один и тот же блок с двумя строками в статусе `active` одновременно (разные среды,
  разные ветки) — это конфликт владения, см. `AGENTS.md` §23.5: не мержить молча,
  сообщить владельцу.
- Блок = конкретный путь/директория (см. `docs/BLOCK-INDEX.md` для ID верхнего уровня),
  НЕ «интерфейс» целиком.
- Изменения `shared/design-system/` и `app/src/core/contracts/` (общий контрактный слой) —
  отдельная строка с пометкой **[контракт]**, требуют записи в `docs/DEV-LOG.md`
  (`AGENTS.md` §23.2).

## Реестр

| Блок (путь) | Среда | Ветка | Начато | Статус | Заметки |
|---|---|---|---|---|---|
| `app/src/workspace/` | ChatGPT/Codex | `GPTInterface` | 2026-07-26 | done | Точное воспроизведение утверждённого HTML-прототипа DaatMed Workspace |
| `app/src/pages/cases/workspace/DraftEditor.module.css` | ChatGPT/Codex | `GPTInterface` | 2026-07-26 | done | Только визуальная оболочка листа и режима редактора по эталону |
| `app/src/foundation/i18n/locales/{ru,he,en}/workspace.json` | ChatGPT/Codex | `GPTInterface` | 2026-07-26 | done | Локализация видимой sterileGate-строки из эталона |
| `app/src/pages/dashboard/` | ChatGPT/Codex | `codex/unified-dashboard-switching` | 2026-07-27 | done | Общий реестр и переключатель General Light ↔ Kanban; персональный Kanban использует общий сервис дел и CaseCard |
| `app/src/foundation/i18n/locales/{ru,he,en}/dashboard.json` | ChatGPT/Codex | `codex/unified-dashboard-switching` | 2026-07-27 | done | Симметричные строки переключателя и Kanban для RU/HE/EN |

## Формат новой строки

```
| app/src/workspace/finder/ | ChatGPT/Codex | codex/ui-finder | 2026-07-26 | active | UX-полировка панели Finder |
```
