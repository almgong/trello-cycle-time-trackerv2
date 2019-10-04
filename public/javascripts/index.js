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

// prompt user to allow this power up to make requests on their behalf
window.Trello.authorize({
  type: 'popup',
  name: 'Trello Cycle Time Tracker',
  scope: {
    read: 'true',
    write: 'false'
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

function computeTimeElapsedInHrs(startAsDate) {
  return Math.floor((new Date() - startAsDate) / 3600000);
}

function presentTimeElapsed(timeElapsedHrs) {
  var days = Math.floor(timeElapsedHrs / 24);
  var remainderHours = timeElapsedHrs % 24;
  var humanizedRemainderHours = remainderHours === 0 ? 'less than 1hr' : remainderHours + 'hrs';

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
// movement of a card from a list NOT included in targetListIds to a list included
// there
//
// if inverse argument is true, then we invert the functionality of this method
// to find the most recent movement of a card from a list inlcluded in targetListIds
// to a list NOT included in the list
function parseMostRecentMoveToOneOfListsFromActions(actions, targetListIds, inverse) {
  var inverseCheck = inverse || false;
  var now = new Date();

  if (!actions.length) {
    return now;
  }

  var mostRecentDate = now;
  for (var i = 0; i < actions.length; i++) {
    if (actions[i].data
        && actions[i].data.listBefore
        && actions[i].data.listAfter
        && inverseCheck ? targetListIds.indexOf(actions[i].data.listBefore.id) !== -1 : targetListIds.indexOf(actions[i].data.listBefore.id) === -1
        && inverseCheck ? targetListIds.indexOf(actions[i].data.listAfter.id) === -1 : targetListIds.indexOf(actions[i].data.listAfter.id) !== -1
    ) {
      mostRecentDate = new Date(actions[i].date);
      break;
    }
  }

  return mostRecentDate;
}

function renderBadge() {
  return t.get('board', 'shared', SETTINGS_STORAGE_KEY).then(function(storedSettings) {
    if (!storedSettings) {
      return PROMPT_FOR_SETTINGS_BADGE;
    }

    var settings = JSON.parse(storedSettings);

    return t.list('id').get('id').then(function(listId) {
      if (settings.selectedCycleTimeLists.indexOf(listId)) { // render badge with time
        return t.get('card', 'shared', INITIAL_CARD_START_TIME_STORAGE_KEY, null).then(function(cardStartTime) {
          if (cardStartTime) {
            var startAsDate = new Date(data);
            var hrsElapsed = Math.floor((new Date() - startAsDate) / 3600000);
            return buildBadge(hrsElapsed, +settings.desiredCycleTime);
          } else { // otherwise, we need to compute and store the last time this card was moved to the current list

          }
        });
      } else { // render a "null" or no badge
        return NULL_BADGE;
      }
    });
  });
}

window.TrelloPowerUp.initialize({
  'show-settings': function (t, options) {
    return t.popup({
      title: 'Cycle Time Tracker Settings',
      url: '/settings',
      height: 200
    });
  },
  'card-badges': function (t, options) {
    return [
      {
        dynamic: function () {
          return t.get('board', 'shared', SETTINGS_STORAGE_KEY).then(function(storedSettings) {
            if (!storedSettings) {
              return PROMPT_FOR_SETTINGS_BADGE;
            }

            var settings = JSON.parse(storedSettings);

            return t.list('id').get('id').then(function(listId) {
              return t.card('id').get('id').then(function(cardId) {
                // if in backlog list, render a NULL badge
                // else if in cycle time list render active badge
                // else render completed badge
                if (listId === settings.backlogList) {
                  console.log('nulling')
                  return t.remove('card', 'shared', INITIAL_CARD_START_TIME_STORAGE_KEY).then(function() {
                    return t.remove('card', 'shared', CARD_COMPLETED_TIME_IN_HRS_STORAGE_KEY).then(function() {
                      return NULL_BADGE;
                    });
                  });
                } else if (settings.selectedCycleTimeLists.indexOf(listId) !== -1) { // render badge with time
                  return t.remove('card', 'shared', CARD_COMPLETED_TIME_IN_HRS_STORAGE_KEY).then(function() {
                    return t.get('card', 'shared', INITIAL_CARD_START_TIME_STORAGE_KEY, null).then(function(storedStartTime) {
                      if (storedStartTime) {
                        return computeTimeElapsedInHrs(new Date(storedStartTime));
                      }

                      return window.Trello.get('/card/' + cardId + '/actions?filter=updateCard').then(function(actions) {
                        var startTime = parseMostRecentMoveToOneOfListsFromActions(actions, settings.selectedCycleTimeLists);
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
                      var completedTime = parseMostRecentMoveToOneOfListsFromActions(actions, settings.selectedCycleTimeLists, true);
                      var hrsElapsed = computeTimeElapsedInHrs(completedTime);

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
      }
    ];
  }
});
