type RequestPayload = {
  action?: "start" | "end";
};

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const CALENDAR_ID_PROPERTY = "CALENDAR_ID";
const CURRENT_EVENT_ID_PROPERTY = "CURRENT_EVENT_ID";
const SPREADSHEET_ID_PROPERTY = "SPREADSHEET_ID";
const SIX_HOUR_SYNC_HANDLER = "syncCurrentMonth";
const WORK_EVENT_TITLE = "勤務";
const WORK_LOG_SHEET_NAME = "work_logs";
const SUMMARY_SHEET_NAME = "summary";

function jsonResponse(body: { [key: string]: JsonValue }): GoogleAppsScript.Content.TextOutput {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function parsePayload(e: GoogleAppsScript.Events.DoPost): RequestPayload {
  const raw = e.postData?.contents || "";

  if (!raw) {
    return {};
  }

  const parsed: unknown = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object") {
    return {};
  }

  const action = (parsed as { action?: unknown }).action;

  if (action === "start" || action === "end") {
    return { action };
  }

  return {};
}

function getRequiredScriptProperty(key: string): string {
  const value = PropertiesService.getScriptProperties().getProperty(key);

  if (!value) {
    throw new Error(`${key} script property is not set`);
  }

  return value;
}

function getCalendar(): GoogleAppsScript.Calendar.Calendar {
  const calendarId = getRequiredScriptProperty(CALENDAR_ID_PROPERTY);
  const calendar = CalendarApp.getCalendarById(calendarId);

  if (!calendar) {
    throw new Error(`calendar not found: ${calendarId}`);
  }

  return calendar;
}

function getMonthRange(now = new Date()): { month: string; start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const month = Utilities.formatDate(start, Session.getScriptTimeZone(), "yyyy-MM");

  return { month, start, end };
}

function getOrCreateSyncSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
  const properties = PropertiesService.getScriptProperties();
  const existingId = properties.getProperty(SPREADSHEET_ID_PROPERTY);

  if (existingId) {
    try {
      return SpreadsheetApp.openById(existingId);
    } catch (err) {
      console.warn(`failed to open spreadsheet ${existingId}: ${String(err)}`);
    }
  }

  const spreadsheet = SpreadsheetApp.create("打刻管理 sync");
  properties.setProperty(SPREADSHEET_ID_PROPERTY, spreadsheet.getId());

  return spreadsheet;
}

function resetSheet(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  sheetName: string
): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  sheet.clear();

  return sheet;
}

function writeTable(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  rows: Array<Array<string | number>>
): void {
  if (rows.length === 0) {
    return;
  }

  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, rows[0].length);
}

function syncCurrentMonth(): void {
  const timeZone = Session.getScriptTimeZone();
  const calendar = getCalendar();
  const spreadsheet = getOrCreateSyncSpreadsheet();
  const { month, start, end } = getMonthRange();
  const events = calendar
    .getEvents(start, end, { search: WORK_EVENT_TITLE })
    .filter((event) => event.getTitle() === WORK_EVENT_TITLE)
    .sort((a, b) => a.getStartTime().getTime() - b.getStartTime().getTime());
  const workRows: Array<Array<string | number>> = [
    ["month", "date", "start", "end", "duration_minutes", "duration_hours", "title", "event_id"],
  ];
  let totalMinutes = 0;

  for (const event of events) {
    const startTime = event.getStartTime();
    const endTime = event.getEndTime();
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

    totalMinutes += durationMinutes;
    workRows.push([
      month,
      Utilities.formatDate(startTime, timeZone, "yyyy-MM-dd"),
      Utilities.formatDate(startTime, timeZone, "HH:mm"),
      Utilities.formatDate(endTime, timeZone, "HH:mm"),
      durationMinutes,
      Math.round((durationMinutes / 60) * 100) / 100,
      event.getTitle(),
      event.getId(),
    ]);
  }

  writeTable(resetSheet(spreadsheet, WORK_LOG_SHEET_NAME), workRows);
  writeTable(resetSheet(spreadsheet, SUMMARY_SHEET_NAME), [
    ["month", "event_count", "total_minutes", "total_hours", "generated_at"],
    [
      month,
      events.length,
      totalMinutes,
      Math.round((totalMinutes / 60) * 100) / 100,
      Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd HH:mm:ss"),
    ],
  ]);
}

function ensureSixHourSyncTrigger(): void {
  const hasTrigger = ScriptApp
    .getProjectTriggers()
    .some((trigger) => trigger.getHandlerFunction() === SIX_HOUR_SYNC_HANDLER);

  if (hasTrigger) {
    return;
  }

  ScriptApp.newTrigger(SIX_HOUR_SYNC_HANDLER).timeBased().everyHours(6).create();
}

function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  try {
    const data = parsePayload(e);
    ensureSixHourSyncTrigger();
    const cal = getCalendar();

    if (data.action === "start") {
      const now = new Date();
      const event = cal.createEvent(
        WORK_EVENT_TITLE,
        now,
        new Date(now.getTime() + 60 * 60 * 1000)
      );

      PropertiesService.getScriptProperties().setProperty(
        CURRENT_EVENT_ID_PROPERTY,
        event.getId()
      );

      return jsonResponse({
        ok: true,
        action: "start",
        eventId: event.getId(),
        start: now.toISOString(),
      });
    }

    if (data.action === "end") {
      const id = PropertiesService.getScriptProperties().getProperty(CURRENT_EVENT_ID_PROPERTY);

      if (!id) {
        return jsonResponse({
          ok: false,
          error: "CURRENT_EVENT_ID not found",
        });
      }

      const event = cal.getEventById(id);

      if (!event) {
        return jsonResponse({
          ok: false,
          error: "event not found",
          eventId: id,
        });
      }

      const now = new Date();
      event.setTime(event.getStartTime(), now);

      PropertiesService.getScriptProperties().deleteProperty(CURRENT_EVENT_ID_PROPERTY);

      return jsonResponse({
        ok: true,
        action: "end",
        eventId: id,
        end: now.toISOString(),
      });
    }

    return jsonResponse({
      ok: false,
      error: "unknown action",
      received: data.action ?? null,
    });

  } catch (err) {
    return jsonResponse({
      ok: false,
      error: String(err),
    });
  }
}
