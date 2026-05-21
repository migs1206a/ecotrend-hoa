export const getNextMinuteDate = (value = new Date()) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return new Date();
  }

  if (date.getSeconds() > 0 || date.getMilliseconds() > 0) {
    date.setMinutes(date.getMinutes() + 1);
  }

  date.setSeconds(0, 0);
  return date;
};

export const getLocalDateTimeInputValue = (value = new Date()) => {
  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

export const getNextLocalDateTimeInputValue = (value = new Date()) =>
  getLocalDateTimeInputValue(getNextMinuteDate(value));
