// Whether we can modify the list of readers.
var storageEnabled = window.localStorage != null;

/**
*  Returns the default list of feed readers.
*/
function defaultReaderList() {
  // This is the default list, unless replaced by what was saved previously.
  return [
    { 'url': 'https://feedly.com/i/discover/sources/search/feed/%s',
      'description': 'Feedly',
    },
    { 'url': 'https://blogtrottr.com/?subscribe=%s',
      'description': 'Blogtrottr',
    },
    { 'url': 'http://add.my.yahoo.com/rss?url=%s',
      'description': 'My Yahoo',
    },
    { 'url': 'http://www.theoldreader.com/feeds/subscribe?url=%s',
      'description': 'The Old Reader',
    },
    { 'url': '%f',
      'description': 'Default Application',
    },
  ];
}

/**
* Check to see if the current item is set as default reader.
*/
function isDefaultReader(url) {
  defaultReader = window.localStorage.defaultReader ?
                      window.localStorage.defaultReader : "";
  return url == defaultReader;
}
