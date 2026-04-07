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

function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  try {
    const data = parsePayload(e);
    const calendarId = getRequiredScriptProperty(CALENDAR_ID_PROPERTY);
    const cal = CalendarApp.getCalendarById(calendarId);

    if (!cal) {
      return jsonResponse({
        ok: false,
        error: "calendar not found",
        calendarId,
      });
    }

    if (data.action === "start") {
      const now = new Date();
      const event = cal.createEvent(
        "勤務",
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
