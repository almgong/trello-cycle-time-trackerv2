var SETTINGS_STORAGE_KEY = 'settings';

var t = TrelloPowerUp.iframe();
var SETTINGS_FORM_SELECTOR = '#settings_form';
var DESIRED_CYCLE_TIME_INPUT_SELECTOR = '#desired_cycle_time';
var CYCLE_TIME_LISTS_CONTAINER_SELECTOR = '.js-ct-lists-container';
var BACKLOG_LIST_CONTAINER_SELECTOR = '.js-backlog-list-container';

function retrieveSettingsFormValues($settingsForm) {
  var selectedListIds = $settingsForm
  .find('.js-list-checkbox')
  .filter(function(index) {
    return $(this).prop('checked');
  }).map(function() {
    return this.id;
  }).get();

  var selectedBacklogListId = $settingsForm.find('.js-list-radio:checked').val();

  return {
    backlogList: selectedBacklogListId,
    desiredCycleTime: $settingsForm.find('#desired_cycle_time').val() || 1,
    selectedCycleTimeLists: selectedListIds // ids here are the actual trello list ids (see #renderUi)
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

  return getTrelloLists().then(function(lists) {
    lists.forEach(function(list) {
      // generate cycle time lists checkboxes
      var listCheckbox = document.createElement('input');
      listCheckbox.setAttribute('type', 'checkbox');
      listCheckbox.setAttribute('id', list.id);
      listCheckbox.classList = 'js-list-checkbox';

      if (settings.selectedCycleTimeLists && settings.selectedCycleTimeLists.indexOf(list.id) !== -1) {
        listCheckbox.setAttribute('checked', true);
      }
      
      var listCheckboxLabel = document.createElement('label');
      listCheckboxLabel.setAttribute('for', listCheckbox.getAttribute('id'));
      listCheckboxLabel.innerText = list.name;
      listCheckboxLabel.classList = 'list-input__label';

      var wrapper = document.createElement('div');
      wrapper.appendChild(listCheckbox);
      wrapper.appendChild(listCheckboxLabel);

      $(CYCLE_TIME_LISTS_CONTAINER_SELECTOR).append(wrapper);

      // generate backlog list radio buttons content
      var radio = document.createElement('input');
      radio.setAttribute('type', 'radio');
      radio.setAttribute('name', 'backloglist');
      radio.setAttribute('id', list.id);
      radio.setAttribute('value', list.id);
      radio.classList = 'js-list-radio';

      if (settings.backlogList && settings.backlogList === list.id) {
        radio.setAttribute('checked', true);
      }

      var radioLabel = document.createElement('label');
      radioLabel.setAttribute('for', radio.getAttribute('id'));
      radioLabel.innerText = list.name;
      radioLabel.classList = 'list-input__label';

      var radioWrapper = document.createElement('div');
      radioWrapper.appendChild(radio);
      radioWrapper.appendChild(radioLabel);

      $(BACKLOG_LIST_CONTAINER_SELECTOR).append(radioWrapper);
    });
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
      console.log('saved settings!');
    });
  });
});

