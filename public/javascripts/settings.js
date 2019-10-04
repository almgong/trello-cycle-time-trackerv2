var SETTINGS_STORAGE_KEY = 'settings';

var t = TrelloPowerUp.iframe();
var SETTINGS_FORM_SELECTOR = '#settings_form';
var DESIRED_CYCLE_TIME_INPUT_SELECTOR = '#desired_cycle_time';
var DESIRED_CYCLE_TIME_LIST_SUFFIX_SELECTOR = '#desired_ct_list_suffix';
var DESIRED_COMPLETION_LIST_INPUT_SELECTOR = '#completion_list';

function retrieveSettingsFormValues($settingsForm) {
  return {
    desiredCycleTime: $settingsForm.find(DESIRED_CYCLE_TIME_INPUT_SELECTOR).val() || 1,
    desiredCtListSuffix: $settingsForm.find(DESIRED_CYCLE_TIME_LIST_SUFFIX_SELECTOR).val() || '*',
    desiredCompletionList: $settingsForm.find(DESIRED_COMPLETION_LIST_INPUT_SELECTOR).val()
  };
}

function getTrelloLists() {
  return t.lists('name', 'id');
}

function getStoredSettings() {
  return t.get('board', 'shared', SETTINGS_STORAGE_KEY, {}).then(function (data) {
    return JSON.parse(data);
  });
}

function storeSettings(settings) {
  return t.set('board', 'shared', SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function renderUi(settings) {
  $(DESIRED_CYCLE_TIME_INPUT_SELECTOR).val(settings.desiredCycleTime);
  $(DESIRED_CYCLE_TIME_LIST_SUFFIX_SELECTOR).val(settings.desiredCtListSuffix || '*');

  var completionListId = settings.desiredCompletionList;

  return getTrelloLists().then(function(lists) {
    var optionsForCompletionList = [];

    lists.forEach(function(list) {
      completionListId = completionListId || list.id;

      // generate option element for completion list
      var option = document.createElement('option');
      option.setAttribute('value', list.id);
      option.innerText = list.name;
      optionsForCompletionList.push(option);
    });

    $(DESIRED_COMPLETION_LIST_INPUT_SELECTOR).append(optionsForCompletionList);
    $(DESIRED_COMPLETION_LIST_INPUT_SELECTOR).val(completionListId);
  });
}

$(function() {
  getStoredSettings().then(function(settings) {
    renderUi(settings);
  });

  $(SETTINGS_FORM_SELECTOR).on('submit', function(e) {
    e.preventDefault();

    var settings = retrieveSettingsFormValues($(this));
    storeSettings(settings).then(function () {
      console.log('saved settings!', settings);
    });
  });
});
