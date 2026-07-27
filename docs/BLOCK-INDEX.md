# BLOCK-INDEX — реестр всех блоков проекта

> **Назначение.** Единая карта: какой блок за что отвечает и где лежит. Цель — при ошибке
> сразу знать, **в каком блоке** она, и что достаточно заменить/переписать ЭТОТ блок, не
> трогая соседей и ядро. Реализует ПРАВИЛО №1 (тотальная блочность) на уровне навигации.
>
> **Живой файл.** Обновляется в ТОЙ ЖЕ правке, что и любой новый/изменённый блок (наравне с
> `DEV-LOG.md` и readiness-реестром). Актуальность проверяется машинно (см. §Актуальность).

---

## §0 — ПРАВИЛО №1 (повтор в начале файла)
Программа = отдельные блоки за контрактами; любой блок легко заменяется/переписывается, не
задевая архитектуру. Блочность **рекурсивна**: блок сам может быть композицией под-блоков
(ID через `/`). Каждый блок И под-блок обязан иметь запись здесь.

## §Схема записи
`ID` — стабильный иерархический идентификатор (`область.блок` / `область.блок/подблок`).
Колонки: **ID** · **Путь** · **Ответственность** · **Контракт/разъём** · **Статус**.
Статус: `live` (работает) · `mock` (заглушка/синтетика) · `partial` · `planned` (ещё нет).
Связи и fitness-тест блока — в колонке «Контракт/разъём» кратко; детально — в коде контракта.

---

## §A. CORE — ядро (generic, без предметики)

| ID | Путь | Ответственность | Контракт/разъём | Статус |
|---|---|---|---|---|
| `core.contracts` | `core/contracts/` | Розетки всех блоков (zod-интерфейсы): module, case, caseDetail, auth, billing, metrics, directory, studio, knowledgeBase, skillLayer, issues, analysis, export, desktopBridge | — (это сами контракты) | live |
| `core.registry` | `core/registry/` | Реестр установленных модулей и биллинга | `module.ts` | live |
| `core.services` | `core/services/` | Сервис-слой + провайдеры; `providers/mock/*` — сменные адаптеры (mock→real) | AiProvider/Repository и др. | mock |
| `core.services.ai` | `core/contracts/ai.ts` + `services/providers/{mock/mockAi,real/aiProvider}.ts` + `services/aiPipeline.ts` | **MVP клиент↔сервер-«мозг»:** контракт `AiProvider`; real-провайдер (🔴 ЕДИНСТВЕННЫЙ `fetch`→origin мозга из конфига, fail-closed) / mock; `aiPipeline` — сборка заявки БЕЗ PHI + ЛОКАЛЬНАЯ ре-гидратация ответа; mock↔real конфигом `VITE_SERVICE_MODE`; отправка ТОЛЬКО через `sterileGate` (checkOutbound до fetch) | `AiProvider` · fitness `servicesAi.test.ts` | **live** |
| `core.services/sterile-gate` | `core/services/sterileGate.ts` | **🔴 БЛОК единственного пути дела наружу (MVP-04, P1 аудита):** refreshScan → карта → тексты (previewText ∪ BlindPic-грань D2) → anonymize → **checkOutbound ДО провайдера (hard-stop, обхода нет)** → mock: ok без отправки / real: отправка+ЛОКАЛЬНАЯ ре-гидратация; fail-safe catch→guard-error; в rules только id правил (PHI нет); `services/index.ts` только собирает (DI) | `SterileGate`/`SterileGateDeps` · fitness `sterileGate.test.ts` (5, боевая версия) + сквозной `mvpVertical.test.ts` | **live** |
| `core.services/folder-intake` | `core/services/folderIntake.ts` | **Приём папки пациента (FEAT-01 §2):** ЧИСТЫЙ классификатор — подпапка→тип (манифест), отсев BlindPic(вход)/мусора-по-расширению/битых; `intakeFolder` в mock-провайдере `mockDocuments` создаёт типизированные документы дела (created) БЕЗ обезличивания — его прогоняет D1 на уровне страницы (не дублируется) | `classifyFolderFiles`/`intakeFolder` · fitness `folderIntake.test.ts`+`mockDocuments.test.ts` | live |
| `core.services/document-blob-store` | `core/services/providers/mock/documentBlobStore.ts` | **Постоянное хранение байтов загруженного файла (веб-путь, наряд upload-fix 2026-07-23):** `IndexedDB` (Blob нативно, переживает F5) с честным in-memory фолбэком, где `indexedDB` недоступен (тесты/jsdom); `mockDocuments` (`makeUploadedDoc`/`previewSource`) — единственный потребитель, про механизм хранения не знает. Fail-safe: сбой транзакции не бросает исключение (см. шапку файла). Desktop-путь (SQLite, `folderIntake.ts`) не трогает | `DocumentBlobStore` (`put`/`get` по `docId`) · fitness `mockDocuments.test.ts`+`preview.test.ts` (косвенно, через previewSource) | live |
| `core.services/case-field-extractor` | `core/services/caseFieldExtractor.ts` | **Автозаполнение формы нового дела (FEAT-01 §3b):** ЛОКАЛЬНОЕ извлечение полей пациента из текста документов — ת"ז ПЕРЕИСПОЛЬЗУЕТ детектор чистой комнаты (`detectInText`), имя/пол/дата события — эвристики иврита; неуверенное → `confidence:'low'` (UI «проверьте»). 🔴 Egress НЕТ (карту токенов не пишет, в сеть не ходит — извлечение PHI для формы ≠ egress) | `extractCaseFields` · fitness `caseFieldExtractor.test.ts` | live |
| `core.services/document-text-extractor` | `core/services/documentTextExtractor.ts` | **Документ папки → текст для предзаполнения (FEAT-01 §3b).** Два пути: (1) `.docx` — локальный разбор ZIP; (2) PDF — сначала цифровой текстовый слой (ЛОКАЛЬНО, `cleanroom.buildInputSignal`), при его отсутствии — распознавание внешним `pdf2txt` (Google Document AI, узкое одобренное исключение из PHI-инварианта, см. CLAUDE.md). 🔴 Решение владельца 2026-07-26: собственного OCR-движка у этого пути больше нет; `recognizePdf` — заглушка (`null`) до отдельной правки, подключающей реальный вызов `pdf2txt` | `DocumentTextExtractorDeps.recognizePdf` · fitness `documentTextExtractor.test.ts`+`documentTextExtractor.robustness.test.ts` | partial |
| `core.export` | `core/export/` | Сборка .docx: `docxRenderer`, `docxExport`, `labels`, `sterilizeDocx`, `provenanceGuard` | `contracts/export.ts` · тесты export/exportBlocked/preview | live |
| `core.content` | `core/content/model.ts` | Модель rich-контента (parse/узлы) | — | live |
| `core.events` | `core/events/bus.ts` | Шина событий (связь блоков ТОЛЬКО через события) | — | live |
| `core.state` | `core/state/session.ts` | Состояние сессии | `contracts/auth.ts` | live |
| `core.readiness` | `core/readiness/` | Реестр статусов заглушек (🔴 точка) | registry/store | live |
| `core.storage` | `core/storage/` | Локальное хранилище (local-first, desktop) | `contracts/desktopBridge.ts` | live |
| `core.help` | `core/help/` | Реестр справки (registry/types/generated) | — | live |
| `core.fitness` | `core/blockFitness.test.ts` + `*.test.ts` | Машинные fitness-тесты блочности и логики | — | live |
| `core.hebrew` | `core/hebrew/` | **Блок иврита (разъём `ScriptKit`) — композиция под-блоков (§A-heb); фасад `index.ts` только оркеструет** | `ScriptKit` (`core/hebrew/contract.ts`) · fitness `hebrewKit.test.ts` | **partial** |
| `core.phi` | `core/services/providers/mock/mockPhi.ts` (+ gate в pages.cases) | СЕРВИС PHI-gate дела (state-машина подтверждения + ручные правки врача 29а·F2 + стерильное превью); движок обезличивания НЕ содержит — делегирует `core.cleanroom` (разграничение 29а·F9) | `PhiService` (get/markInReview/confirm/sterilePreview/addIdentifier/removeIdentifier) | partial |
| `core.cleanroom` | `core/cleanroom/` | **«Чистая комната» (§9.2) — композиция под-блоков (§A-clean): детекторы PHI, карта токенов, anonymize/deanonymize, контентный egress-чек, растровый путь visual-redact + чистая зона BlindPic (§2а/§3.9); фасад `index.ts` только оркеструет** | фасад `cleanroom` (`core/cleanroom/contract.ts`) · fitness `cleanroom.test.ts` + `visualRedact.test.ts` | partial |
| `core.imaging` | `core/imaging/` | **Работа с изображением, ВНЕ языка (§2а/§3.8) — композиция под-блоков (§A-img): растеризация, улучшение, деструктивное затирание; фасад только оркеструет** | контракты `core/imaging/contract.ts` · fitness `imaging.test.ts` | partial |
| `core.doctorProfile` | `core/contracts/doctorProfile.ts` + `core/services/providers/mock/mockDoctorProfile.ts` | Личность врача как ЛОКАЛЬНЫЕ данные (вынос 2026-07-19): реквизиты/квалификация/подпись/декларации/бланк; нет профиля → плейсхолдеры `[[DOCTOR_*]]` | `DoctorProfileService` · grep-гейт `doctorProfile.test.ts` | live |
| `core.templates` | `core/contracts/templates.ts` + `core/services/providers/mock/mockTemplates.ts` | TemplateLibrary: шаблоны врача local-first; под-блоки: template-store · template-list · template-picker · template-add · template-delete · template-edit · template-apply (в экспортёре); sticky last-used | `TemplateLibraryService` | live |
| `tooling.backupGuard` | `scripts/backup-guard.mjs` + `scripts/githooks/pre-push` | Egress-guard git-бэкапа: реквизиты (список из `.local/`), секреты, PHI; fail-safe | `check(files) → {ok, violations}` · fitness `backupGuard.test.ts` | live |
| `tooling.blockIndex` | `scripts/gen-block-index.mjs` | Генератор AUTO-инвентаря этого файла + режим `--check` | fitness `blockIndex.test.ts` | live |
| `tooling.controlCenterReport` | `scripts/report-control-center.mjs` + `.github/workflows/control-center-telemetry.yml` | Репортёр CI-workflow'ов (id/имя/статус/ветка/SHA) в DaatMed Control Center; fail-safe — без настроенных секретов молча выходит (exit 0) | GitHub Actions env + `DAATMED_CONTROL_CENTER_URL`/`DAATMED_TELEMETRY_TOKEN`/`DAATMED_SITES_BYPASS_TOKEN` | live |

### §A-heb — под-блоки блока иврита `core.hebrew` (рекурсивно; спека: `test-handoff/BLOCK-SPEC-hebrew-rtl-engine.md`)

| ID | Путь | Ответственность | Под-контракт | Статус |
|---|---|---|---|---|
| `core.hebrew/pdf` | `core/hebrew/pdfSource.ts` | открыть PDF, извлечь текстовый слой (логический порядок; **РЕАЛЬНЫЙ pdf.js/`pdfjs-dist`, байты напрямую, worker локальный — без сети**; пустой слой→null=скан) | `PdfSource` | **live** |
| `core.hebrew/ocr` | `core/hebrew/pdfSource.ts` | 🔴 **Решение владельца 2026-07-26: НЕ распознаватель документов** (эта роль полностью передана внешнему `pdf2txt`) — единственное оставшееся назначение: **предохранитель чистой комнаты**, проверка остатка PHI после визуального затирания (`core/cleanroom/visualRedact.ts`, residual-чек). **РЕАЛЬНЫЙ tesseract.js WASM heb+eng, ЛОКАЛЬНЫЕ ассеты — CDN-free/без egress**, браузер-only, PHI не в логи; Ф1 SYNTH-OCR-контейнер для тестов. `createOcrEngine` обёрнут бюджетом времени (`OCR_TIMEOUT_MS`=8с) — обход подтверждённого бага tesseract.js 5.1.1; сбой ИЛИ таймаут → `null` | `OcrEngine` | **live** |
| `core.hebrew/normalize` | `core/hebrew/normalize.ts` | апострофы/финальные/никуд/presentation → NFC | `Normalizer` | live |
| `core.hebrew/matchPattern` | `core/hebrew/matchPattern.ts` | иврит-нечувствительный матчер значений (29а·F1): никуд optional, финали классами — обезличивание/egress | `HebrewMatcher` | live |
| `core.hebrew/morph` | `core/hebrew/quality.ts` | огласовка/разбор/спряжение (DICTA/hspell/Pealim) | `Morphology` | mock |
| `core.hebrew/tokenize` | `core/hebrew/tokenize.ts` | токенизация (bidi+апострофы) | `Tokenizer` | live |
| `core.hebrew/bidi` | `core/hebrew/bidi.ts` | изоляция вставок (48(3)/PMID/латиница), UAX #9 | `BidiWrap` | live |
| `core.hebrew/docx` | `core/hebrew/docxRtl.ts` | правила RTL для Word на ВСЕХ уровнях (фикс §4: sectPr+docDefaults+jc=right) | `DocxRtl` | live |
| `core.hebrew/html` | `core/hebrew/htmlRtl.ts` | dir=rtl HTML (email/preview) | `HtmlRtl` | live |
| `core.hebrew/pdf-out` | `core/hebrew/pdfRender.ts` | PDF из HTML (≠ входной `pdf`; server-side Ф2) | `PdfRender` | mock |
| `core.hebrew/ui-direction` | `core/hebrew/uiDirection.ts` | политика direction каркаса (перенос из i18n; не first-strong) | `UiDirection` | live |
| `core.hebrew/lexicon-he-he` | `core/hebrew/lexicon/heHe.ts` | толковый иврит↔иврит (Wiktionary) | `LexiconSource` | mock |
| `core.hebrew/lexicon-he-ru` | `core/hebrew/lexicon/heRu.ts` | словарь иврит↔русский (Reverso) | `LexiconSource` | mock |
| `core.hebrew/lexicon-he-en` | `core/hebrew/lexicon/heEn.ts` | словарь иврит↔английский (Morfix) | `LexiconSource` | mock |
| `core.hebrew/lexicon-medical` | `core/hebrew/lexicon/medical.ts` | медицинский иврит (термбанк Академии) | `LexiconSource` | mock |
| `core.hebrew/spellcheck` | `core/hebrew/quality.ts` | орфография (hspell) | `SpellChecker` | mock |
| `core.hebrew/terms` | `core/hebrew/terms.ts` | растущий локальный глоссарий утверждённых терминов | `TermStore` | live |
| `core.hebrew/nativeReview` | `core/hebrew/quality.ts` | протокол уровня носителя: оркеструет spell/morph/lexicon, флаги неуверенности | `NativeReview` | partial |
| `core.hebrew/agreeGender` | `core/hebrew/agreeGender.ts` | согласование рода по полу лица (перенос из `hebrewStyle`) | `GenderAgreement` | live |

Онлайн-вызов любого словаря = egress: только термин, без PHI (§8.1 спеки).
Контракт всех граней — `core/hebrew/contract.ts`; фасад — `core/hebrew/index.ts`.

### §A-clean — под-блоки чистой комнаты `core.cleanroom` (рекурсивно; спека: `test-handoff/BLOCK-SPEC-phi-cleanroom-egress.md`)

| ID | Путь | Ответственность | Под-контракт | Статус |
|---|---|---|---|---|
| `core.cleanroom/contract` | `core/cleanroom/contract.ts` | контракты всех граней (ScanSource, PhiDetector, TokenMap, OutboundCheck) | — (это сами контракты) | live |
| `core.cleanroom/det-govId` | `core/cleanroom/detectors/govId.ts` | ת"ז: валидная чек-сумма ИЛИ метка ת.ז рядом (двухуровневый — ноль ложных) | `PhiDetector` | live |
| `core.cleanroom/det-phone` | `core/cleanroom/detectors/phone.ts` | израильские телефоны (мобильные свободно; городские только с разделителем — 9 цифр подряд = зона gov-id) | `PhiDetector` | live |
| `core.cleanroom/det-known` | `core/cleanroom/detectors/knownValues.ts` | известные значения дела (имя пациента/ת"ז/адвокат) — сравнение через hebrewKit.normalize | `PhiDetector` | live |
| `core.cleanroom/det-titles` | `core/cleanroom/detectors/titles.ts` | титулованные имена (ד"ר/פרופ׳ + имя) и учреждения (מרפאת/בי"ח…); маркеры = данные | `PhiDetector` | live |
| `core.cleanroom/tokenMap` | `core/cleanroom/tokenMap.ts` | карта значение↔токен: assignTokens, phiKey, persist `mo.phi.map.<caseId>` + индекс (ТОЛЬКО локально) | `TokenMap` | live |
| `core.cleanroom/manualEdits` | `core/cleanroom/manualEdits.ts` | человек в контуре (29а·F2): ручные добавления/удаления врача `mo.phi.manual.<caseId>`; скан применяет ПОВЕРХ и не затирает | `ManualEdits` | live |
| `core.cleanroom/anonymizer` | `core/cleanroom/anonymizer.ts` | оркестратор скана + anonymize/deanonymize (варианты написания кавычек) | `CleanroomScanResult` | live |
| `core.cleanroom/variants` | `core/cleanroom/variants.ts` | варианты написания значения (гершайим ↔ ASCII-кавычка, апострофы) | — | live |
| `core.cleanroom/outbound` | `core/cleanroom/outbound.ts` | контентный egress-чек исходящего текста (hard-fail; в находках НЕТ значений) | `OutboundCheckResult` | live |
| `core.cleanroom/desktopSync` | `core/cleanroom/desktopSync.ts` | needles (значения+варианты) → desktop-main по IPC после каждого скана | `DesktopEgressBridge` | live |
| `core.cleanroom/suggestZones` | `core/cleanroom/suggestZones.ts` | авто-подсказка зон затирания для холста врача (§3.9): фрагменты с PHI → зоны; детекция НЕ дублируется (detectInText ∪ checkOutbound — значения карт всех дел); Ф1 координаты из synthText, Ф2 — боксы реального OCR за той же гранью | `RedactZone[]` | partial |
| `core.cleanroom/visual-redact` | `core/cleanroom/visualRedact.ts` | оркестратор растрового пути (§2а/§3.9): 🔴 предусловие порядка (0.4а·F2 — дело сканировано PHI-gate'ом, карта есть, иначе `case-not-scanned`) → rasterize → preprocess → авто-зоны → холст врача (разъём `MaskReview`, человек в контуре) → redact-burn → OCR → 🔴 residual-чек с опорой на карту дела (PHI остался на картинке → hard-stop с зонами дозатирания, токен его НЕ спасает) → токен-страховка → BlindPic; артефакт несёт ноль PHI (0.4а·F1); любой сбой/отмена → BlindPic не пополнен (запись — последний шаг) | `VisualRedact` | partial |
| `core.cleanroom/input-router` | `core/cleanroom/inputRouter.ts` | входная маршрутизация «текст ↔ растр» (§2а шаг 0.6, §5 #12): чистая детерминированная route(signal) — валидный текстовый слой → `ScanSource` (текстовый путь §3.1–3.2, без OCR); нет/пустой/мусорный слой + растровый носитель → `RasterInput` для visualRedact; 🔴 антидеградация: сомнение в тексте → raster, НИКОГДА не text молча; ни текста ни файла → `unroutable` с reason-кодом БЕЗ PHI ('no-content'/'unsupported-media', имя документа в reason не попадает); предикат валидности текста и маппинг media→kind — сменные за контрактом; сам не извлекает/не растеризует/не зовёт сеть; наружу — через фасад (`cleanroom.routeInput`) | `InputRouter` | partial |
| `core.cleanroom/input-signal-builder` | `core/cleanroom/inputSignalBuilder.ts` | строитель входного сигнала документа (§2а шаг 0.8): дескриптор {name, bytes?, mediaHint?} → `DocInputSignal` для routeInput; цифровой текстовый слой — ТОЛЬКО через hebrewKit.pdf.extractText с method==='text' и непустым текстом; 🔴 анти-байпас: OCR-текст/null/пустой → textLayer=null («0 символов текста → скан»; скан обезличивается только растровым путём — текстовым слоем НЕ пролезает); media — детерминированный сменный маппер hint/mime/расширение → 'pdf'|'image'|'other'; изоляция: extractText упал/недоступен → null → растр, нет байтов → сигнал без file (routeInput → unroutable), текст не выдумывается; сам не маршрутизирует/не растеризует/не OCR/не сеть; наружу — `cleanroom.buildInputSignal`; deps (extractText/mediaKind) — DI, сменны | `InputSignalBuilder` | partial |
| `core.cleanroom/deidentify-pipeline` | `core/cleanroom/deidentifyPipeline.ts` | headless-дирижёр обезличивания ОДНОГО документа (§2а шаг 0.7): route(signal) → текстовый путь (scan → items+карта дела) ИЛИ растровый (visualRedact.process → VisualRedactResult БЕЗ переинтерпретации кодов: ok/residual-phi/cancelled/case-not-scanned/… как есть) ИЛИ unroutable (reason без PHI, ничего не обезличено); 🔴 предусловие порядка §2а не обходит ('case-not-scanned' пробрасывается, молча не «чинится»); 🔴 BlindPic-граница §5 #10: растровый выход — только артефакт в blindStore (кладёт visualRedact), текстовый — только карта токенов, сырых байтов/путей в исходе нет; UI и модель документов не знает (DocInputSignal строит страничный блок — следующий); deps (route/scan/visualRedact) — DI, сменны независимо; наружу — `cleanroom.deidentifyDocument` | `DeidentifyPipeline` | partial |
| `core.cleanroom/blindStore` | `core/cleanroom/blindStore.ts` | чистая зона `BlindPic` (§2а): обезличенные артефакты (затёртые страницы + стерильный OCR-текст, ноль PHI-метаданных) с нейтральными именами `doc-NN` + ЛОКАЛЬНАЯ side-карта neutralId→имя исходника (0.4а·F1: связь blind↔оригинал, хранится ОТДЕЛЬНО, наружу не уходит); 🔴 наружу уходит только содержимое артефактов; Ф1 in-memory, Ф2-desktop — папка `BlindPic/` + реестр кейса ВНЕ неё за тем же контрактом | `BlindPicStore` | mock |

Правило границы: PHI-детекция и карты токенов НИГДЕ вне `core/cleanroom` (fitness: ключ
`mo.phi.map` грепается по src). Телефоны/имена ВНЕ карт outbound сознательно не блокирует
(бланк/контакт самого врача — его воля, LEGAL-SHIELD); жёсткий стоп — только PHI пациента.

### §A-img — под-блоки блока изображений `core.imaging` (рекурсивно; спека §2а + §3.8; растровый путь §8 шаг 0)

| ID | Путь | Ответственность | Под-контракт | Статус |
|---|---|---|---|---|
| `core.imaging/contract` | `core/imaging/contract.ts` | контракты граней: RasterPage (чистые RGBA-байты, без DOM), Rasterizer, ImagePreprocess/PreprocessStep, RedactBurn/RedactMask | — (это сами контракты) | live |
| `core.imaging/rasterize` | `core/imaging/rasterize.ts` | документ → растр-битмапы: картинка — реальный декод; **PDF — РЕАЛЬНЫЙ pdf.js render → canvas → RGBA (адаптер `renderPdfBrowser.ts`), mock-флаг снят**; повреждённый вход → флаг, не краш | `Rasterizer` | **live** |
| `core.imaging/decodeBrowser` | `core/imaging/decodeBrowser.ts` | единственное DOM-место блока: Blob → RGBA через createImageBitmap+OffscreenCanvas; в node-тестах не участвует | `ImageDecoder` | live |
| `core.imaging/preprocess` | `core/imaging/preprocess.ts` | оркестратор улучшения: реестр/порядок шагов = данные; сбой шага → skippedSteps (best-effort, не блок) | `ImagePreprocess` | live |
| `core.imaging/steps` | `core/imaging/steps.ts` | шаги-под-под-блоки за `PreprocessStep` (честные пиксельные алгоритмы): upscale ≥300DPI (билинейный) · deskew (projection-profile + поворот) · contrast (перцентильное растяжение) · binarize (адаптивный порог + глобальный для низкоконтрастных окон — не «выедает» заливки) · denoise (медиана 3×3); perspective — вынесен в отдельный под-под-блок (строка ниже) | `PreprocessStep` | partial |
| `core.imaging/perspective` | `core/imaging/perspective.ts` | коррекция перспективы фото под углом (keystone): solveHomography + warpPerspective (движок распрямления — реальная детерминированная математика, билинейная выборка) + detectDocumentQuad (авто-детектор Ф1-эвристика, ИНЖЕКТИРУЕМЫЙ — точка расширения Ф2/ручной UI углов); шаг `PreprocessStep` RGBA→RGBA, строгий no-op на плоском скане/прямоугольнике, вырожденная гомография → вход как есть | `PreprocessStep` | partial |
| `core.imaging/redact-burn` | `core/imaging/redactBurn.ts` | 🔴 деструктивное затирание зон маски врача: пиксели выжигаются насмерть в битмапе (НЕ снимаемый слой), synthText-записи с любым пересечением зоны удаляются (частично закрытое имя не «читается»); кламп к границам, пустая маска → вход как есть | `RedactBurn` | live |

Синтетический текстовый слой `RasterPage.synthText` — только для тестов/моков Ф1 (семантика
«текст под зоной исчезает» проверяется честно с mock-OCR); реальный OCR (Ф2) читает пиксели.

---

## §A-server — сервер-«мозг» (`server/`, MVP шаг 1; вне клиента, stateless, PHI НЕТ)

| ID | Путь | Ответственность | Контракт/разъём | Статус |
|---|---|---|---|---|
| `server.config` | `server/src/config.ts` | env-конфиг, fail-fast без `ANTHROPIC_API_KEY`; ключ герметичен (не в `JSON.stringify`) | `loadServerConfig` | live |
| `server.contracts` | `server/src/contracts.ts` | zod-схемы `/analyze` (AnalyzeRequest/Response), Claude I/O-маркеры | — | live |
| `server.knowledge` | `server/src/knowledge.ts` | нормативка как ДАННЫЕ: таблицы נכות avoda/hanechim (48(3)(ב) только hanechim), формула взвешивания, скелеты секций A/B; 🔴 БЕЗ реквизитов (плейсхолдеры) | `knowledgeFor` | live |
| `server.prompt` | `server/src/prompt.ts` | системный промпт = метод навыка (−1…7) + knowledge + правила «в рамках истины» + `[[DOCTOR_*]]`; наука honest-fallback | `buildSystemPrompt` | live |
| `server.claude` | `server/src/claude.ts` | 🔴 единственный сетевой вызов: `@anthropic-ai/sdk`, `claude-opus-4-8`, adaptive+streaming; ключ из config; сбой→`ai-unavailable`; клиент инжектится (мок) | `RunClaude` | live |
| `server.sections` | `server/src/sections.ts` | ответ Claude → секции A/B + memo + needsDoctorConfirm; мусор→`unparseable` | `parseSections` | live |
| `server.pipeline` | `server/src/pipeline.ts` | склейка knowledge→prompt→claude→sections; коды; stateless | `analyze` | live |
| `server.api` | `server/src/api.ts` | Fastify `POST /analyze` + `GET /health`; zod-валидация; PHI-гигиена логов; stateless | HTTP | live |
| `server.auth` | `server/src/auth.ts` | 🔴 общий секрет клиент↔сервер (MVP-05 E1): заголовок `x-daatmed-key` ↔ env `DAATMED_API_KEY`, constant-time (SHA-256+timingSafeEqual), 401 без деталей, /health открыт; пустой ключ = ошибка сборки | `createAuthPreHandler`/`verifyDaatmedKey` · `auth.test.ts` | live |
| `server.rateLimit` | `server/src/rateLimit.ts` | rate-limit (MVP-05 E2): свой, скользящее окно в памяти, лимиты env (10/мин, 200/день), идентичность ключ+IP, слой ПОСЛЕ auth, 429; /health не лимитируется; = потолок расходов Claude | `createRateLimiter`/`createRateLimitPreHandler` · `rateLimit.test.ts` | live |
| `server.index` | `server/src/index.ts` | композиционный корень (config→claude(timeout)→auth+rateLimit→api→listen 0.0.0.0) | — | live |

🔴 Реквизиты врача НИКОГДА на сервере (плейсхолдеры); ключ Claude — env; вход обезличен клиентом.
🔴 **auth + rate-limit — ДО публичного запуска** (риск приёмки A, `docs/ПЛАН-MVP.md §5`).

---

## §B. MODULES — предметные плагины (SpecialtyModule и др.)

| ID | Путь | Ответственность | Контракт/разъём | Статус |
|---|---|---|---|---|
| `modules.orthopedic-foot-ankle` | `modules/orthopedic-foot-ankle/manifest.ts` | Специальность №1: разделы/шаблоны/термины/סעיפים стопы-голеностопа | `SpecialtyModule` | live |
| `modules.billing-subscription` | `modules/billing-subscription/index.ts` | Модуль подписки/тарифов | `PaymentProvider`/`PricingRule` | mock |

---

## §C. FOUNDATION — дизайн-система и инфраструктура

| ID | Путь | Ответственность | Контракт/разъём | Статус |
|---|---|---|---|---|
| `foundation.ui` | `foundation/ui/` | Дизайн-система; **каждый компонент — под-блок** (см. §C-ui) | design-system | live |
| `foundation.i18n` | `foundation/i18n/` | Переводы UI (LanguagePack), locales he/ru/en | `LanguagePack` | live |
| `foundation.tokens` | `foundation/tokens/tokens.css` | Форвардер → общий модуль `design-system` (реэкспорт токенов через @import, не дубль) | `design-system` | live |
| `foundation.styles` | `foundation/styles/global.css` | Форвардер → общий модуль `design-system` (реэкспорт базы через @import) | `design-system` | live |
| `foundation.fontScale` | `foundation/fontScale.ts` | **Масштаб ТОЛЬКО текста (UX-02 §1):** хоткеи Ctrl+«+»/«-»/«0» (вкл. цифровой блок) → CSS-переменная `--font-scale` на :root (множит исключительно токены `--font-size-*` дизайн-системы; контейнеры/отступы/контролы не трогает — не зум), диапазон 0.85–1.6 шаг 0.1, персист appStorage `ui.fontScale`; монтируется один раз в AppProviders, экраны не знают; видимой кнопки нет (решение владельца) | `useFontScale` (+ чистые clamp/action) · fitness `fontScale.test.ts` (вкл. статический гейт «--font-scale только в --font-size-*») | live |
| `foundation.diff` | `foundation/diff.ts` | Утилита сравнения (версии) | — | live |

### §C-ui — под-блоки дизайн-системы `foundation.ui` (каждый = отдельный блок)
`Button` · `Input` · `PasswordInput` · `Field` · `Select` · `Checkbox` · `Switch` ·
`SegmentedControl` · `RadioCards` · `Steps` · `Card` · `Alert` · `Badge` · `Tooltip` ·
`DropdownMenu` · `Dialog` · `Tabs` · `Table` · `ProgressBar` · `Skeleton` · `Spinner` ·
`Icon` · `EmptyState` · `BackButton`. Все — `foundation/ui/<Name>.tsx` (+ `.module.css`).

---

## §C2. DESIGN-SYSTEM (shared) + SITE — общий дизайн-модуль и публичный сайт (SITE-01)

🔴 **ПРАВИЛО №1 владельца (модульность дизайна):** визуал = ОДИН источник; правка токена меняет
вид И в программе (`app`), И на сайте (`site`).

**Общий дизайн-модуль** `shared/design-system/` (уровень foundation, не зависит от предметики):
единый источник визуала для обоих потребителей. Токены `shared/design-system/tokens/tokens.css`
(палитра navy #15283B + бирюза #0D7367 как бренд-токены, шрифты, spacing/radii/тени), база
`shared/design-system/styles/global.css` (reset/типографика/`.bidi-isolate`), theme-объект
`shared/design-system/tokens.ts`. Потребители подключают через `@ds/*`; программа — ещё и
форвардерами `foundation/tokens|styles`. Компоненты ПЕРЕИСПОЛЬЗУЮТСЯ из `foundation/ui` (не дубль;
на сайте — alias `@ui`). Доказательство единого источника — `site/src/design-system.singlesource.test.ts`.

| ID | Путь | Ответственность | Контракт/разъём | Статус |
|---|---|---|---|---|
| `design-system` | `shared/design-system/` | Общий модуль визуала (токены + theme-объект); ПРАВИЛО №1 | токены темы (CSS + theme) | live |

**Сайт** `site/` (React+Vite, НЕ Electron) — вход + регистрация врача daatmed.co.il, RTL + he/ru/en:

| ID | Путь | Ответственность | Статус |
|---|---|---|---|
| `site.app` | `site/src/App.tsx` + `site/src/main.tsx` | Роутер (login/register/forgot/sent) + бутстрап + RTL | live |
| `site.pages` | `site/src/pages/` | Экраны: LoginPage, RegisterPage, RegisterSentPage, ForgotPage (в стиле программы) | live |
| `site.ui` | `site/src/ui/` | Каркас сайта: AuthLayout, Brand (navy+бирюза), LanguageMenu | live |
| `site.i18n` | `site/src/i18n/` | i18n сайта (common+site he/ru/en) + `direction.ts` (зеркало политики `core/hebrew`) | live |
| `site.lib` | `site/src/lib/` | Валидация (zod), специальности (стопа/голеностоп открыта, прочие — лист ожидания), регистрация на ПЛЕЙСХОЛДЕР-endpoint (данные не теряются молча) | live |
| `site.test` | `site/src/test/` | Setup + jsdom-полифилы для переиспользуемых `@ui` | live |

---

## §D. APP — единый каркас (shell) и общие узлы

| ID | Путь | Ответственность | Контракт/разъём | Статус |
|---|---|---|---|---|
| `app.shell` | `app/shell/` | Неподвижный каркас: `AppShell`, `TopBar`, `SideNav`; топбар-пункты — под-блоки (§D-top); 🔴 безопасность ролей (владелец 2026-07-21): у роли doctor НЕТ видимых входов в админ-зону (adminPanel/dev-switch только у admin; SideNav по ролям; демо-подсказка входа без admin@) — сторож `adminVisibility.test.tsx` | UI-каркас | live |
| `app.editor` | `app/editor/` | Редактор: `RichTextEditor`, `RichContentView` (→ cvяжется с `core.hebrew`) | — | live |
| `app.preview` | `app/preview/` | Превью документов: `FilePreview`, `rtfText` (→ `core.hebrew`) | — | live |
| `app.readiness` | `app/readiness/ReadinessDot.tsx` | Отрисовка 🔴 точки заглушки (owner-only) | `core.readiness` | live |
| `app.help` | `app/help/` | Встроенные подсказки: `HelpHint`, `helpPath` | `core.help` | live |
| `app.routes` | `app/routes/` + `router.tsx` + `AppProviders.tsx` | Роутинг, guards, NotFound, Placeholder | — | live |
| `app.navigation/go-back` | `app/navigation/useGoBack.ts` | **«Назад» = экран-источник (UX-02 §3b):** `navigate(-1)` при наличии внутренней истории (idx в history.state), иначе fallback-роут (replace); потребители — карточка дела (CaseHeader), PHI-gate, редактор Studio, NotFound | `useGoBack(fallback)` · fitness `useGoBack.test.tsx` (Главная→дело→назад=Главная; Мои дела→дело→назад=Мои дела; прямой вход→fallback) | live |

### §D-top — под-блоки верхнего меню `app.shell` (каждый пункт = отдельный блок, UI-NAVIGATION)
`AccountMenu` · `NotificationsBell` · `LanguageSwitcher` · `BillingChip` · `HelpButton` —
все `app/shell/topbar/<Name>.tsx`.

---

## §E. PAGES — экраны (каждый экран/диалог = блок)

| ID | Путь | Ответственность | Статус |
|---|---|---|---|
| `pages.auth` | `pages/auth/` | Вход/регистрация: Login, Register, Forgot, RegisterSent, AuthLayout | live |
| `pages.dashboard` | `pages/dashboard/` | Два подключаемых главных экрана: существующий `General Light` + персональный `Kanban`; под-блоки `DashboardViewRegistry` (единый реестр), `DashboardViewSwitcher` (мгновенное переключение с персистом), `KanbanDashboard` (произвольные колонки/цвета/порядок, drag-and-drop дел, годы/поиск) и общий `CaseCard`; выбор дела ведёт в единый `/cases/:id`, медицинская логика не дублируется. UX-01 `Section`/`useCollapsed` сохранены без изменения | `services.cases.list` + `appStorage`; fitness `DashboardPage.test.tsx` + `DashboardViewSwitcher.test.tsx` | live |
| `pages.cases` | `pages/cases/` | Дела: CasesList, NewCaseWizard, PhiGate | mock |
| `pages.cases/workspace` | `pages/cases/workspace/` | Рабочее место дела: CaseWorkspace, DraftEditor, CaseHeader, AnalysisPanel, DocumentsPane, ExportDialog, RevisionsDialog, FinalizeDialog | mock |
| `pages.cases/workspace/panel` | `.../workspace/panel/` | Правые панели: Contradictions, Disputed, Attention | mock |
| `pages.cases/redact-canvas` | `pages/cases/redact/` | UI-холст «Paint» растрового пути (§2а/§3.9, человек в контуре) за разъёмом ядра `MaskReview` (БЕЗ правки ядра): диалог `RedactCanvas` (прямоугольник / кисть-штампы / ластик / zoom; правит ТОЛЬКО маску, пиксели не трогает) + чистые слои `maskEditor` (зоны = пиксели страницы; кисть = квадраты-штампы — rect-only контракт ядра) и `viewTransform` (zoom-маппинг; RTL не зеркалит координаты) + мост `useMaskReview` (promise↔React, слот `opts.reviewMask`); «Применить»→маска врача, «Отмена»/сбой отрисовки→null (в BlindPic ничего) + страничный mount `useDocumentDeidentify` (§2а·0.9): источник документа (`previewSource`: файл-blob→растр, сид-OCR-текст→синтетический цифровой-PDF, none→unroutable) → `buildInputSignal` → `deidentifyDocument` (+холст, `knownValues` из дела) → исход по путям/кодам; точка входа — кнопка «Обезличить→BlindPic» в `DocumentsPane` (превью документа) | partial |
| `pages.cases/folder-intake` | `pages/cases/intake/` | **Приём папки пациента (FEAT-01 §3):** оркестратор `useFolderIntake` (desktop-мост pick+read → `documents.intakeFolder` → 🔴 ПЕРЕИСПОЛЬЗУЕТ D1 `useDocumentDeidentify` по каждому документу; предусловия чистой комнаты и холст-`reviewMask` НЕ обходятся) + UI `FolderIntakeControl` (кнопка + честный прогресс принято/типы/пропущено; строки локальны — foundation не трогаем, §4); fitness `useFolderIntake.test.tsx` | live |
| `pages.cases/folder-to-new-case` | `pages/cases/intake/` (useFolderToNewCase · FolderToNewCaseButton · caseFormPrefill · folderHandoff) | **Точка входа «Главная → дело из папки» (FEAT-01 §3b):** кнопка на дашборде → выбор папки → ЛОКАЛЬНОЕ извлечение полей (`buildInputSignal`+`extractCaseFields`) → форма нового дела ПРЕДЗАПОЛНЕНА (человек в контуре: врач правит; пол — лишь при высокой уверенности, HEBREW-STYLE §2); байты папки → `folderHandoff` (память, НЕ router-state); импорт документов в дело — `intakeFolder`; fitness `useFolderToNewCase.test.tsx`+`caseFormPrefill.test.ts` | live |
| `pages.admin` | `pages/admin/` | Админ: Overview, KnowledgeBase, BillingAdmin, doctorsDashboard/* | mock |
| `pages.billing` | `pages/billing/BillingPage.tsx` | Кабинет оплаты/кредитов | mock |
| `pages.knowledge` | `pages/knowledge/` | Просмотр базы знаний | mock |
| `pages.studio` | `pages/studio/` | Студия (StudioEditor/StudioList) | mock |
| `pages.skillLayer` | `pages/skillLayer/` | Слои навыка | mock |
| `pages.help` | `pages/help/HelpPage.tsx` | Экран Справки | live |
| `pages.design` | `pages/design/DesignShowcasePage.tsx` | Витрина дизайн-системы (dev) | live |
| `pages.profile` | `pages/profile/` | Локальные данные врача: `DoctorCredentialsPage` (реквизиты+бланк, вводит врач) · `TemplatesPage` (менеджер шаблонов, CRUD+sticky) | live |

---

## §F. DESKTOP / MOCKS

| ID | Путь | Ответственность | Статус |
|---|---|---|---|
| `desktop` | `desktop/` | Electron-split: `desktopFrontend`, `sessionSync` (local-first) | partial |
| `desktop.main/window` | `desktop/src/main/window.ts` | Окно + два профиля доверия + изоляция (поправка B) | partial |
| `desktop.main/egress` | `desktop/src/main/egress.ts` | Egress-guard локальной зоны ПОЛНЫЙ (§9.2): сеть (allowlist) + контент (скан тела) | partial |
| `desktop.main/egressContent` | `desktop/src/main/egressContent.ts` | Контентный скан тела запроса: needle-store (память), чек-сумма ת"ז (зеркало cleanroom), uploadData→text; тест `egressContent.test.ts` | live |
| `desktop.main/zoom` | `desktop/src/main/zoom.ts` | Зум ВСЕГО окна: ТОЛЬКО Ctrl+колесо + pinch, персист userData/zoom.json; 🔴 UX-02 §2 — клавиши Ctrl+«+»/«-»/«0» НЕ перехватывает (отданы renderer'у под размер текста, `foundation.fontScale`); сторож — `zoom.test.ts` (before-input-event не подписан) | `installZoom(win)` | live |
| `desktop.main/webZone` | `desktop/src/main/webZone.ts` | Веб-зона daatmed (заготовка Ф1, БЕЗ preload) | mock |
| `desktop.main/ipc` | `desktop/src/main/ipc.ts` | Узкий IPC storage/session/egress-needles + folder-pick (FEAT-01) + sender-guard | partial |
| `desktop.main/folder-intake` | `desktop/src/main/folderIntake.ts` | **Мост выбора папки пациента (FEAT-01 §2а·а):** системный диалог `openDirectory` + обход (корень + один уровень подпапок) в байты; BlindPic не читает, потолок на файл, битый/недоступный→null (сервис пропустит); renderer без Node — доступ к ФС только здесь (за IPC `folderPick`); fitness `folderIntake.test.ts` | live |
| `desktop.main/localStore` | `desktop/src/main/localStore.ts` | Локальный SQLite KV («как Word») | partial |
| `desktop.main/sessionToken` | `desktop/src/main/sessionToken.ts` | Токен автологина в safeStorage | partial |
| `desktop.main/index` | `desktop/src/main/index.ts` | Бутстрап main-процесса (single-instance, профили) | partial |
| `mocks` | `mocks/` | Синтетические данные для dev ($0, без PHI): caseDetails, cases, demoUsers, kbDocs, issues, synthSeed | mock |

---

## §S. SERVER — сервер-«мозг» (MVP шаг 1; наряд `test-handoff/FABLE-TASK-mvp-01-server-brain.md`)

Stateless-сервис: обезличенный текст дела → Claude (метод навыка + нормативка) → черновик по секциям.
🔴 PHI сюда не приходит и не хранится; реквизиты врача — ТОЛЬКО плейсхолдеры `[[DOCTOR_*]]`
(подстановка на клиенте); ключ Claude — только env `ANTHROPIC_API_KEY`. Промпты/нормативка живут
здесь и НЕ попадают во frontend-bundle (IP-PROTECTION).

| ID | Путь | Ответственность | Разъём | Статус |
|---|---|---|---|---|
| `server` | `server/` | Каркас пакета (Node/TS, ESM, vitest/oxlint); под-блоки §4 наряда: config → knowledge → prompt → claude → sections → api | — | partial |
| `server.config` | `server/src/config.ts` | Единственное чтение env: `loadServerConfig()` {model=opus, port, apiKeyPresent} — 🔴 ключ наружу НЕ отдаётся (только факт наличия; значение — исключительно `claudeApiKey()` для claude-client); fail-fast без ключа/с кривым портом — сервис не стартует | `loadServerConfig` / `claudeApiKey` | live |

---

## §W. WORKSPACE — переработка интерфейса (ТЗ `docs/ui/UI-REDESIGN-EXACT-SPEC.md` + эталон `docs/ui/reference/`)

Новое рабочее пространство дела (4 зоны Navigator·Finder·Editor·Aux, «один в один» по эталону-прототипу).
🔴 Полноэкранное на `/cases/:id` (вариант владельца «A»); старый экран сохранён на `/cases/:id/legacy` до
приёмки. Логика/сервисы не переписываются — блоки-зоны оборачивают существующее. Этап 1 — каркас.

| ID | Путь | Ответственность | Разъём | Статус |
|---|---|---|---|---|
| `workspace` | `app/src/workspace/` | Каркас рабочего пространства: WorkspaceShell (тонкий TopBar 48px + 4 зоны-слота + resizer + режим фокуса + RTL/тема), WorkspacePage (сборка со слотами; зоны Э2-5) | `WorkspaceShellSlots` | partial |
| `workspace.layout` | `app/src/workspace/layout/` | Состояние раскладки (§12/§17): типы+`clampPaneWidth` (Editor≥420, 40vw, скрытые зоны не резервируют)+`fitWidthsToViewport` (§12.4 — подгонка ЭФФЕКТИВНЫХ ширин под узкое окно, без затирания persisted-предпочтения), storage `mo.layout.workspace.v1` (+миграция со старых `mo.layout.*`), `useWorkspaceLayout` (viewport-resize→`effectiveWidths`), `ColumnResizer` (pointer+клавиши+dblclick, AUX-инверсия, ARIA separator), context | `WorkspaceLayoutApi` · fitness `workspaceLayout.test.ts` | partial |
| `workspace.topbar` | `app/src/workspace/topbar/` | Верхняя панель (§7): `WorkspaceTopBar` (бренд/тема/язык), `PaneToggleGroup` (Панель/Колонка/Файл/ИИ/Фокус), `CaseSelector` (Э5 живой: cases.list свежие-сверху, выбор переоткрывает workspace), `PhiStatusBadge` (Э5 живой: phi.get → зелёный бейдж / жёлтая кнопка-переход на PHI-gate); справка/аккаунт — слоты | — | partial |
| `workspace.navigator` | `app/src/workspace/navigator/` | Зона NAVIGATOR (§8): вкладки Дела/База/Шаблоны (`NavigatorTabs`), дерево на реальных сервисах (`useNavigatorModel`+чистый `navigatorBuild` — cases/knowledgeBase/templates), поиск-фильтр по структуре, узлы (`NavigatorTree`/`NavigatorTreeNode`), подвал (`NavigatorFooter`), CRUD-меню (`NavigatorContextMenu`; rename/remove ждут расширения контракта — показаны неактивными), session-состояние `useNavigatorState` | fitness `navigatorBuild.test.ts` | partial |
| `workspace.selection` | `app/src/workspace/selection/` | Канал выбора зон (§9/§17): `WorkspaceSelectionProvider`+`useWorkspaceSelection` — единый владелец «какая папка/файл выбраны» (ссылки, не данные); связывает Navigator→Finder→Editor | `WorkspaceSelectionApi` | partial |
| `workspace.finder` | `app/src/workspace/finder/` | Зона FINDER (§9): содержимое выбранной папки на реальных источниках за контрактом (`useFinderModel`+чистый `finderBuild` — DocumentService/BlindPic/заключение/анализ), хлебная крошка, поиск файлов, строка файла (`FinderFileRow`: открыть ↗ / рядом ▤), состояния; открытие в Editor/Aux — канал selection (этап 4). 🔴 Наряд upload-fix 2026-07-23: `UploadDocumentsDialog` больше НЕ виснет навсегда при недоступном OCR (таймаут в `core.hebrew/ocr`) и закрывается ВСЕГДА (снят busy-гейт на `onOpenChange`) | fitness `finderBuild.test.ts`+`UploadDocumentsDialog.test.tsx`+`useFinderUpload.test.ts` | partial |
| `workspace.fileSource` | `app/src/workspace/fileSource/` | Общий разъём «файл → источник превью» для Editor-вкладки и Aux-«файла рядом»: документ → `DocumentService.previewSource`, BlindPic-артефакт → текст чистой комнаты; рендер — существующий `FilePreview` (не дублируется) | `useFileSource(FileSourceRequest)` | partial |
| `workspace.editor` | `app/src/workspace/editor/` | Зона EDITOR (§10): ЧИСТАЯ логика вкладок (`editorTabs.ts`: закреплённое заключение + файловые, open/close/activate), `useEditorTabs` (слушает канал selection), полоса вкладок (`EditorTabsBar`, эталон .doc-tabs), заключение — СУЩЕСТВУЮЩИЙ `DraftEditor` за обёрткой `OpinionEditor` (TipTap не переписан), файл — `FileViewer` (шапка + FilePreview + «открыть рядом»), статус-бар autosave (`EditorPane`); под-блок tabs-input (§10.2) — ФИЗИЧЕСКИЙ ввод закрытия вкладок: средняя кнопка мыши + Ctrl/Cmd+W (layout-aware: ивритская/кириллическая раскладки через `e.code`, AZERTY не ломается; обязательный preventDefault — окно не падает), чистое распознавание в `editorTabsInput.ts`, решение «можно ли закрыть» — существующий `editorTabs.closeTab`; зона действия хоткея — фокус внутри редактора (onKeyDown контейнера, НЕ window; вне редактора клавиша безопасно бездействует — компромисс задокументирован в шапке файла) | fitness `editorTabs.test.ts` · `editorTabsInput.test.ts` · `EditorTabsBar.input.test.tsx` · `EditorPane.hotkey.test.tsx` | partial |
| `workspace.aux` | `app/src/workspace/auxpane/` | Зона AUX (§11): секция «Файл рядом» (общий fileSource + существующий FilePreview, закрытие через `selection.clearOpen`); секция «Панель анализа» (`AuxAnalysisSection` — СУЩЕСТВУЮЩИЙ `AnalysisPanel` целиком, ширина сведена CSS-переменной `--case-panel-w`, collapse → скрытие зоны); ИИ-чат — будущий блок (честная заглушка) | — | partial |
| `workspace.caseActions` | `app/src/workspace/caseActions/` | Действия дела в новой оболочке (эталон: ряд между вкладками и документом): чистые гейты запуска (`caseActionGates.computeStartGate` — PHI→документы→БЗ→биллинг→уже-идёт), опрос прогона (`useCaseRun` — общий с Aux), бар (`CaseActionsBar`: Авто-анализ/Финализация/Снятие подписи/Экспорт — СУЩЕСТВУЮЩИЕ FinalizeDialog/ExportDialog/ConfirmDialog, ключи cases.json 1:1 со старой шапкой) | fitness `caseActionGates.test.ts` | partial |

---

## §Актуальность — как индекс поддерживается машинно (иначе протухнет)

Ручной индекс на 250+ файлов устаревает за дни. Поэтому актуальность — не дисциплина, а машина
(задание Fable в фазе индексации):

1. **Генератор** `scripts/gen-block-index.mjs` сканирует структуру (`core/contracts`, `registry`,
   `modules/*/manifest`, `foundation/ui`, `app`, `pages`) и обновляет авто-секции этого файла
   (между AUTO-маркерами). Ответственность/связи —
   ручная колонка, генератор её сохраняет.
2. **Fitness-тест** `core/blockIndex.test.ts`: (a) каждый модуль/контракт/страница/ui-компонент
   имеет запись; (b) нет записи без файла (мёртвая ссылка); (c) новый блок без записи → тест
   **падает**. Это и гарантирует «каждый новый блок индексируется».
3. **Правило разработки:** запись в BLOCK-INDEX появляется в ТОЙ ЖЕ правке, что и блок (как
   DEV-LOG/readiness). На чек-поинте Fable отчитывается: что добавлено/изменено в индексе.

> Статусы `live/mock/partial` держать синхронно с readiness-реестром (не дублировать логику —
> readiness остаётся источником статуса; здесь статус справочно).

---

## §Инвентарь (авто)

<!-- AUTO:begin (gen-block-index; не редактировать вручную) -->

_Инвентарь блочных юнитов (скан 221); каждый обязан быть покрыт записью в таблицах выше:_

- `app/src/app/shell/topbar/AccountMenu.tsx`
- `app/src/app/shell/topbar/BillingChip.tsx`
- `app/src/app/shell/topbar/HelpButton.tsx`
- `app/src/app/shell/topbar/LanguageSwitcher.tsx`
- `app/src/app/shell/topbar/NotificationsBell.tsx`
- `app/src/core/cleanroom/`
- `app/src/core/content/`
- `app/src/core/contracts/`
- `app/src/core/contracts/ai.ts`
- `app/src/core/contracts/analysis.ts`
- `app/src/core/contracts/auth.ts`
- `app/src/core/contracts/billing.ts`
- `app/src/core/contracts/case.ts`
- `app/src/core/contracts/caseDetail.ts`
- `app/src/core/contracts/desktopBridge.ts`
- `app/src/core/contracts/directory.ts`
- `app/src/core/contracts/doctorProfile.ts`
- `app/src/core/contracts/export.ts`
- `app/src/core/contracts/issues.ts`
- `app/src/core/contracts/knowledgeBase.ts`
- `app/src/core/contracts/metrics.ts`
- `app/src/core/contracts/module.ts`
- `app/src/core/contracts/skillLayer.ts`
- `app/src/core/contracts/studio.ts`
- `app/src/core/contracts/templates.ts`
- `app/src/core/events/`
- `app/src/core/export/`
- `app/src/core/hebrew/`
- `app/src/core/hebrew/agreeGender.ts`
- `app/src/core/hebrew/bidi.ts`
- `app/src/core/hebrew/contract.ts`
- `app/src/core/hebrew/docxRtl.ts`
- `app/src/core/hebrew/htmlRtl.ts`
- `app/src/core/hebrew/index.ts`
- `app/src/core/hebrew/lexicon/heEn.ts`
- `app/src/core/hebrew/lexicon/heHe.ts`
- `app/src/core/hebrew/lexicon/heRu.ts`
- `app/src/core/hebrew/lexicon/medical.ts`
- `app/src/core/hebrew/matchPattern.ts`
- `app/src/core/hebrew/nameLexicon.ts`
- `app/src/core/hebrew/normalize.ts`
- `app/src/core/hebrew/pdfRender.ts`
- `app/src/core/hebrew/pdfSource.ts`
- `app/src/core/hebrew/quality.ts`
- `app/src/core/hebrew/terms.ts`
- `app/src/core/hebrew/tokenize.ts`
- `app/src/core/hebrew/uiDirection.ts`
- `app/src/core/help/`
- `app/src/core/imaging/`
- `app/src/core/readiness/`
- `app/src/core/registry/`
- `app/src/core/services/`
- `app/src/core/services/providers/mock/caseState.ts`
- `app/src/core/services/providers/mock/documentBlobStore.ts`
- `app/src/core/services/providers/mock/mockAi.ts`
- `app/src/core/services/providers/mock/mockAnalysis.ts`
- `app/src/core/services/providers/mock/mockAuth.ts`
- `app/src/core/services/providers/mock/mockCases.ts`
- `app/src/core/services/providers/mock/mockDirectory.ts`
- `app/src/core/services/providers/mock/mockDoctorProfile.ts`
- `app/src/core/services/providers/mock/mockDocuments.ts`
- `app/src/core/services/providers/mock/mockExport.ts`
- `app/src/core/services/providers/mock/mockIssues.ts`
- `app/src/core/services/providers/mock/mockKnowledgeBase.ts`
- `app/src/core/services/providers/mock/mockMetrics.ts`
- `app/src/core/services/providers/mock/mockPhi.ts`
- `app/src/core/services/providers/mock/mockSkillLayer.ts`
- `app/src/core/services/providers/mock/mockStudio.ts`
- `app/src/core/services/providers/mock/mockTemplates.ts`
- `app/src/core/state/`
- `app/src/core/storage/`
- `app/src/foundation/ui/Alert.tsx`
- `app/src/foundation/ui/BackButton.tsx`
- `app/src/foundation/ui/Badge.tsx`
- `app/src/foundation/ui/Button.tsx`
- `app/src/foundation/ui/Card.tsx`
- `app/src/foundation/ui/Checkbox.tsx`
- `app/src/foundation/ui/Dialog.tsx`
- `app/src/foundation/ui/DropdownMenu.tsx`
- `app/src/foundation/ui/EmptyState.tsx`
- `app/src/foundation/ui/Field.tsx`
- `app/src/foundation/ui/Icon.tsx`
- `app/src/foundation/ui/Input.tsx`
- `app/src/foundation/ui/PasswordInput.tsx`
- `app/src/foundation/ui/ProgressBar.tsx`
- `app/src/foundation/ui/RadioCards.tsx`
- `app/src/foundation/ui/SegmentedControl.tsx`
- `app/src/foundation/ui/Select.tsx`
- `app/src/foundation/ui/Skeleton.tsx`
- `app/src/foundation/ui/Spinner.tsx`
- `app/src/foundation/ui/Steps.tsx`
- `app/src/foundation/ui/Switch.tsx`
- `app/src/foundation/ui/Table.tsx`
- `app/src/foundation/ui/Tabs.tsx`
- `app/src/foundation/ui/Tooltip.tsx`
- `app/src/modules/billing-subscription/`
- `app/src/modules/orthopedic-foot-ankle/`
- `app/src/pages/admin/`
- `app/src/pages/auth/`
- `app/src/pages/billing/`
- `app/src/pages/cases/`
- `app/src/pages/dashboard/`
- `app/src/pages/design/`
- `app/src/pages/help/`
- `app/src/pages/knowledge/`
- `app/src/pages/profile/`
- `app/src/pages/skillLayer/`
- `app/src/pages/studio/`
- `app/src/workspace/WorkspacePage.tsx`
- `app/src/workspace/WorkspaceShell.tsx`
- `app/src/workspace/auxpane/AuxAnalysisSection.tsx`
- `app/src/workspace/auxpane/AuxPane.tsx`
- `app/src/workspace/auxpane/aichat/AiAssistantSection.tsx`
- `app/src/workspace/auxpane/aichat/ChatComposer.tsx`
- `app/src/workspace/auxpane/aichat/ChatMessageList.tsx`
- `app/src/workspace/auxpane/aichat/QuickActionsBar.tsx`
- `app/src/workspace/auxpane/aichat/contract.ts`
- `app/src/workspace/auxpane/aichat/defaultPort.ts`
- `app/src/workspace/auxpane/aichat/quickActions.ts`
- `app/src/workspace/auxpane/aichat/sterileChatPort.ts`
- `app/src/workspace/auxpane/fileActions/FileNearbyActions.tsx`
- `app/src/workspace/auxpane/fileActions/contract.ts`
- `app/src/workspace/auxpane/fileActions/provenance.ts`
- `app/src/workspace/caseActions/CaseActionsBar.tsx`
- `app/src/workspace/caseActions/caseActionGates.ts`
- `app/src/workspace/caseActions/useCaseRun.ts`
- `app/src/workspace/editor/EditorPane.tsx`
- `app/src/workspace/editor/EditorTabsBar.tsx`
- `app/src/workspace/editor/EditorToolbar.tsx`
- `app/src/workspace/editor/FileViewer.tsx`
- `app/src/workspace/editor/OpinionEditor.tsx`
- `app/src/workspace/editor/ReferenceViewer.tsx`
- `app/src/workspace/editor/WordCount.tsx`
- `app/src/workspace/editor/editorFormat.ts`
- `app/src/workspace/editor/editorTabs.ts`
- `app/src/workspace/editor/editorTabsInput.ts`
- `app/src/workspace/editor/referenceModel.ts`
- `app/src/workspace/editor/useEditorTabs.ts`
- `app/src/workspace/editor/wordCountModel.ts`
- `app/src/workspace/fileSource/useFileSource.ts`
- `app/src/workspace/finder/FinderDropzone.tsx`
- `app/src/workspace/finder/FinderFileContextMenu.tsx`
- `app/src/workspace/finder/FinderFileRow.tsx`
- `app/src/workspace/finder/FinderHeaderActions.tsx`
- `app/src/workspace/finder/FinderPane.tsx`
- `app/src/workspace/finder/UploadDocumentsDialog.tsx`
- `app/src/workspace/finder/finderBuild.ts`
- `app/src/workspace/finder/finderFileActions.ts`
- `app/src/workspace/finder/finderFileMenuStrings.ts`
- `app/src/workspace/finder/finderItem.types.ts`
- `app/src/workspace/finder/finderUploadCore.ts`
- `app/src/workspace/finder/finderUploadStrings.ts`
- `app/src/workspace/finder/useFinderModel.ts`
- `app/src/workspace/finder/useFinderUpload.ts`
- `app/src/workspace/layout/ColumnResizer.tsx`
- `app/src/workspace/layout/WorkspaceLayoutContext.tsx`
- `app/src/workspace/layout/useWorkspaceLayout.ts`
- `app/src/workspace/layout/workspaceLayout.types.ts`
- `app/src/workspace/layout/workspaceLayoutStorage.ts`
- `app/src/workspace/navigator/NavigatorContextMenu.tsx`
- `app/src/workspace/navigator/NavigatorFooter.tsx`
- `app/src/workspace/navigator/NavigatorPane.tsx`
- `app/src/workspace/navigator/NavigatorTabs.tsx`
- `app/src/workspace/navigator/NavigatorTree.tsx`
- `app/src/workspace/navigator/NavigatorTreeNode.tsx`
- `app/src/workspace/navigator/navigatorBuild.ts`
- `app/src/workspace/navigator/navigatorFolders.ts`
- `app/src/workspace/navigator/navigatorTree.types.ts`
- `app/src/workspace/navigator/referenceOpen.ts`
- `app/src/workspace/navigator/useNavigatorModel.ts`
- `app/src/workspace/navigator/useNavigatorState.ts`
- `app/src/workspace/selection/WorkspaceSelectionContext.tsx`
- `app/src/workspace/selection/workspaceSelection.types.ts`
- `app/src/workspace/topbar/CaseSelector.tsx`
- `app/src/workspace/topbar/PaneToggleGroup.tsx`
- `app/src/workspace/topbar/PhiStatusBadge.tsx`
- `app/src/workspace/topbar/TopBarAccount.tsx`
- `app/src/workspace/topbar/TopBarHelp.tsx`
- `app/src/workspace/topbar/WorkspaceTopBar.tsx`
- `desktop/src/main/autoUpdate.ts`
- `desktop/src/main/egress.ts`
- `desktop/src/main/egressContent.ts`
- `desktop/src/main/folderIntake.ts`
- `desktop/src/main/index.ts`
- `desktop/src/main/ipc.ts`
- `desktop/src/main/lastFolder.ts`
- `desktop/src/main/localStore.ts`
- `desktop/src/main/sessionToken.ts`
- `desktop/src/main/webZone.ts`
- `desktop/src/main/window.ts`
- `desktop/src/main/zoom.ts`
- `scripts/backup-guard.mjs`
- `scripts/gen-block-index.mjs`
- `scripts/report-control-center.mjs`
- `server/src/accounts/adminAuth.ts`
- `server/src/accounts/contracts.ts`
- `server/src/accounts/cors.ts`
- `server/src/accounts/index.ts`
- `server/src/accounts/password.ts`
- `server/src/accounts/routes.ts`
- `server/src/accounts/service.ts`
- `server/src/accounts/store.ts`
- `server/src/accounts/token.ts`
- `server/src/api.ts`
- `server/src/auth.ts`
- `server/src/claude.ts`
- `server/src/config.ts`
- `server/src/contracts.ts`
- `server/src/index.ts`
- `server/src/knowledge.ts`
- `server/src/pipeline.ts`
- `server/src/prompt.ts`
- `server/src/rateLimit.ts`
- `server/src/sections.ts`
- `shared/design-system/index.ts`
- `shared/design-system/tokens.ts`
- `site/src/i18n/`
- `site/src/lib/`
- `site/src/pages/`
- `site/src/test/`
- `site/src/ui/`

<!-- AUTO:end -->
