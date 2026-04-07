type OuraSleepRecord = {
  bedtime_start: string;
  bedtime_end: string;
};

type OuraSleepResponse = {
  data?: OuraSleepRecord[];
};

const OURA_TOKEN_PROPERTY = "OURA_TOKEN";
const CALENDAR_ID_PROPERTY = "CALENDAR_ID";
const SLEEP_EVENT_TITLE_PREFIX = "睡眠";

function getRequiredScriptProperty(key: string): string {
  const value = PropertiesService.getScriptProperties().getProperty(key);

  if (!value) {
    throw new Error(`${key} script property is not set`);
  }

  return value;
}

function configureOura(token: string, calendarId: string): void {
  if (!token) {
    throw new Error("token is required");
  }

  if (!calendarId) {
    throw new Error("calendarId is required");
  }

  PropertiesService.getScriptProperties().setProperties({
    [OURA_TOKEN_PROPERTY]: token,
    [CALENDAR_ID_PROPERTY]: calendarId,
  });
}

function connectOuraApi(api: string, parameters: Record<string, string>, token: string): OuraSleepResponse {
  const baseUrl = "https://api.ouraring.com/v2/usercollection/";
  const query = Object.keys(parameters)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(parameters[key])}`)
    .join("&");
  const url = `${baseUrl}${api}?${query}`;
  const requestOptions: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    muteHttpExceptions: true,
    method: "get",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
  const response = UrlFetchApp.fetch(url, requestOptions);

  if (response.getResponseCode() >= 400) {
    throw new Error(`Oura API failed: ${response.getResponseCode()} ${response.getContentText()}`);
  }

  return JSON.parse(response.getContentText()) as OuraSleepResponse;
}

function main() {
  const token = getRequiredScriptProperty(OURA_TOKEN_PROPERTY);
  const api = "sleep";
  const endDate = new Date();
  const startDate = new Date();

  startDate.setDate(startDate.getDate() - 7);

  const parameters = {
    start_date: Utilities.formatDate(startDate, Session.getScriptTimeZone(), "yyyy-MM-dd"),
    end_date: Utilities.formatDate(endDate, Session.getScriptTimeZone(), "yyyy-MM-dd"),
  };
  const sleepData = connectOuraApi(api, parameters, token);

  for (const sleep of sleepData.data ?? []) {
    addEventGoogleCalendar(sleep.bedtime_start, sleep.bedtime_end);
  }
} 

function findEvents(
  calendar: GoogleAppsScript.Calendar.Calendar,
  title: string,
  startTime: Date,
  endTime: Date
): GoogleAppsScript.Calendar.CalendarEvent[] {
  const events = calendar.getEvents(startTime, endTime);

  return events.filter((event) => event.getTitle() === title);
}

function addEventGoogleCalendar(bedtime: string, awakeTime: string): void {
  const calendarId = getRequiredScriptProperty(CALENDAR_ID_PROPERTY);
  const calendar = CalendarApp.getCalendarById(calendarId);

  if (!calendar) {
    throw new Error(`calendar not found: ${calendarId}`);
  }

  const bedtimeDate = new Date(bedtime);
  const awakeTimeDate = new Date(awakeTime);
  const sleepDuration = awakeTimeDate.getTime() - bedtimeDate.getTime();
  const hours = Math.floor(sleepDuration / (1000 * 60 * 60));
  const minutes = Math.floor((sleepDuration / (1000 * 60)) % 60);
  const eventTitle = `🌙${SLEEP_EVENT_TITLE_PREFIX}（${hours}時間${minutes}分)`;

  const existingEvents = findEvents(calendar, eventTitle, bedtimeDate, awakeTimeDate);

  if (existingEvents.length === 0) {
    calendar.createEvent(eventTitle, bedtimeDate, awakeTimeDate);
  }
}
