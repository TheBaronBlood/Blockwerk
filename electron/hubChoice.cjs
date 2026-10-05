// ---------------------------------------------------------------
// Auswahl des Hubs im Programm (ohne Electron, getestet in tests/hubChoice.test.ts).
// Chromium meldet bei einer Suche die gefundenen Geräte und wartet auf eine Antwort; die Seite
// zeigt die Liste und antwortet mit der Kennung des gewählten Geräts oder mit '' (abbrechen).
//
// Die Schwierigkeit: »Abbrechen« kann kommen, bevor Chromium überhaupt etwas gemeldet hat. Dann
// gibt es noch nichts, dem man antworten könnte – die Antwort muss warten, bis die Suche sich
// zum ersten Mal meldet. Dieses Vormerken darf aber nur für die laufende Suche gelten: Früher
// blieb es stehen und brach nach jeder Verbindung die nächste Bluetooth-Suche sofort ab (die
// Seite schickt zum Aufräumen nach jedem Verbindungsversuch ein »Abbrechen«).
// ---------------------------------------------------------------

function createHubChoice(){
  /** Antwort an Chromium für die Auswahl, die gerade offen ist. */
  let answer = null;
  /** In der laufenden Suche kam »Abbrechen«, bevor Chromium sich gemeldet hat. */
  let cancelled = false;

  return {
    /** Die Seite beginnt eine neue Suche: Was von einer früheren vorgemerkt ist, gilt nicht mehr. */
    searchStarted(){ cancelled = false; },

    /**
     * Die Bluetooth-Suche meldet Geräte. Liefert true, wenn die Liste an die Seite gehen soll –
     * und false, wenn diese Suche schon abgebrochen wurde (sie ist damit beantwortet).
     */
    bluetoothFound(callback){
      if (cancelled){ cancelled = false; callback(''); return false; }
      answer = callback;
      return true;
    },

    /** Am Kabel gibt es mehrere Schnittstellen zur Wahl. */
    serialOffered(callback){ answer = callback; },

    /** Die Seite hat gewählt; '' heißt abbrechen. Liefert true, wenn damit eine offene Auswahl beantwortet wurde. */
    chosen(id){
      if (!answer){
        // nichts offen: Ein »Abbrechen« gilt der Suche, die sich noch nicht gemeldet hat
        if (id === '') cancelled = true;
        return false;
      }
      const done = answer;
      answer = null;
      done(typeof id === 'string' ? id : '');
      return true;
    },

    get waiting(){ return answer !== null; },
    get cancelPending(){ return cancelled; }
  };
}

module.exports = { createHubChoice };
