var INITIAL_CARD_START_TIME_STORAGE_KEY = 'start-time';
var CARD_COMPLETED_TIME_IN_HRS_STORAGE_KEY = 'completed-time';
var SETTINGS_STORAGE_KEY = 'settings';
var BADGE_REFRESH_INTERVAL_SECONDS = 60;
var NULL_BADGE = {};
var PROMPT_FOR_SETTINGS_BADGE = {
  text: 'Please configure the cycle time power up :)'
};
var IN_PROGRESS_CARD_LABEL_PREFIX = 'In progress for';
var COMPLETED_CARD_LABEL_PREFIX = 'Completed in';
var Promise = window.TrelloPowerUp.Promise;

// no more than 10 operations per second
var serialExecutor = new window.Rately.default.SerialRatelyExecutor({
  maxOperationsPerInterval: 5,  // 100 is the max, see https://developers.trello.com/docs/rate-limits
  rateLimitIntervalMs: 500, // 1/2 seconds
  bufferMs: 300
});

// prompt user to allow this power up to make requests on their behalf
window.Trello.authorize({
  type: 'popup',
  name: 'Trello Cycle Time Tracker',
  scope: {
    read: true,
    write: false,
    account: false
  },
  expiration: 'never',
  success: function() {
    console.log('authenticated successfully')
  },
  error: function() {
    alert('Unable to authenticate, the power up may not work as intended');
  }
});

function buildBadge(timeElapsedHrs, desiredCycleTime, labelPrefix) {
  var textPrefix = labelPrefix ? labelPrefix + ' ' : '';

  return {
    text: textPrefix + presentTimeElapsed(timeElapsedHrs),
    color: getColorForTimeElapsedRatio(timeElapsedHrs / desiredCycleTime),
    refresh: BADGE_REFRESH_INTERVAL_SECONDS
  };
}

function computeTimeElapsedInHrs(startAsDate, referenceDate) {
  referenceDate = referenceDate || new Date();
  return Math.floor((referenceDate - startAsDate) / 3600000);
}

function presentTimeElapsed(timeElapsedHrs) {
  var days = Math.floor(timeElapsedHrs / 24);
  var remainderHours = timeElapsedHrs % 24;
  var humanizedRemainderHours = remainderHours === 0 ? 'less than 1hr' : remainderHours + 'hr';

  return (days ? days + 'd ' : '') + humanizedRemainderHours;
}

function getColorForTimeElapsedRatio(timeElapsedRatio) {
  if (timeElapsedRatio < .5) {
    return 'green';
  } else if (timeElapsedRatio < .90) {
    return 'orange';
  } else {
    return 'red';
  }
}

// this method returns a date object that denotes the most recent
// movement of a card from a list NOT including the name suffix to a list that
// does include it
//
// if inverse argument is true, then we invert the functionality of this method
// to find the most recent movement of a card from a list with the suffix
// to a list NOT without it
function parseMostRecentMoveToOneOfListsFromActions(actions, listSuffix, inverse) {
  var inverseCheck = inverse || false;
  var now = new Date();

  if (!actions.length) {
    return now;
  }

  var mostRecentDate = now;
  for (var i = 0; i < actions.length; i++) {
    if (!(actions[i].data
      && actions[i].data.listBefore
      && actions[i].data.listAfter
      && actions[i].data.listBefore.name
      && actions[i].data.listAfter.name)
    ) {
        continue;
    }

    var movementFromListCondition = inverseCheck ? actions[i].data.listBefore.name.endsWith(listSuffix) : !actions[i].data.listBefore.name.endsWith(listSuffix);
    var movementToListCondition = inverseCheck ? !actions[i].data.listAfter.name.endsWith(listSuffix) : actions[i].data.listAfter.name.endsWith(listSuffix);
    if (movementFromListCondition && movementToListCondition) {
      mostRecentDate = new Date(actions[i].date);
      break;
    }
  }

  return mostRecentDate;
}

function isCycleTimeList(settings, listName) {
  return listName.endsWith(settings.desiredCtListSuffix);
}

function isCompletionList(settings, listId) {
  return listId === settings.desiredCompletionList;
}

function isBacklogList(settings, listName) {
  return listName.endsWith(settings.desiredRtListSuffix);
}

function renderCardBadge(t) {
  return t.get('board', 'shared', SETTINGS_STORAGE_KEY).then(function(storedSettings) {
    if (!storedSettings) {
      return PROMPT_FOR_SETTINGS_BADGE;
    }

    var settings = JSON.parse(storedSettings);

    return t.list('id', 'name').then(function(list) {
      return t.card('id').get('id').then(function(cardId) {
        // if in backlog list, render a NULL badge
        // else if in cycle time list render active badge
        // else render completed badge
        // if (listId === settings.backlogList) {
        if (isBacklogList(settings, list.name)) {
          console.log('backlog list, nulling...');

          return t.remove('card', 'shared', INITIAL_CARD_START_TIME_STORAGE_KEY).then(function() {
            return t.remove('card', 'shared', CARD_COMPLETED_TIME_IN_HRS_STORAGE_KEY).then(function() {
              return NULL_BADGE;
            });
          });
      } else if (isCycleTimeList(settings, list.name)) { // render badge with time
          return t.remove('card', 'shared', CARD_COMPLETED_TIME_IN_HRS_STORAGE_KEY).then(function() {
            return t.get('card', 'shared', INITIAL_CARD_START_TIME_STORAGE_KEY, null).then(function(storedStartTime) {
              if (storedStartTime) {
                return computeTimeElapsedInHrs(new Date(storedStartTime));
              }

              return window.Trello.get('/card/' + cardId + '/actions?filter=updateCard').then(function(actions) {
                var startTime = parseMostRecentMoveToOneOfListsFromActions(actions, settings.desiredCtListSuffix);
                return t.set('card', 'shared', INITIAL_CARD_START_TIME_STORAGE_KEY, startTime).then(function() {
                  return computeTimeElapsedInHrs(startTime);
                });
              });
            }).then(function(hrsElapsed) {
              return buildBadge(hrsElapsed, +settings.desiredCycleTime, IN_PROGRESS_CARD_LABEL_PREFIX);
            });
          });
        } else { // render a completed badge
          return t.get('card', 'shared', CARD_COMPLETED_TIME_IN_HRS_STORAGE_KEY, null).then(function(completedTimeHrs) {
            if (completedTimeHrs !== null) {
              return buildBadge(+completedTimeHrs, settings.desiredCycleTime, COMPLETED_CARD_LABEL_PREFIX);
            }

            return window.Trello.get('/card/' + cardId + '/actions?filter=updateCard').then(function(actions) {
              var startTime = parseMostRecentMoveToOneOfListsFromActions(actions, settings.desiredCtListSuffix);
              var completedTime = parseMostRecentMoveToOneOfListsFromActions(actions, settings.desiredCtListSuffix, true);
              var hrsElapsed = computeTimeElapsedInHrs(startTime, completedTime);

              return t.set('card', 'shared', CARD_COMPLETED_TIME_IN_HRS_STORAGE_KEY, hrsElapsed).then(function() {
                return buildBadge(hrsElapsed, +settings.desiredCycleTime, COMPLETED_CARD_LABEL_PREFIX);
              });
            });
          });
        }
      });
    });
  });
}

window.TrelloPowerUp.initialize({
  'show-settings': function (t, _options) {
    return t.popup({
      title: 'Cycle Time Tracker Settings',
      url: '/settings',
      height: 200
    });
  },
  'card-badges': function (t, _options) {
    return [
      {
        dynamic: function () {
          return new Promise(function (res, _rej) {
            serialExecutor.add({
              workFn: function() { return renderCardBadge(t); },
              cbFn: res
            });
          });
        }
      }
    ];
  }
});
