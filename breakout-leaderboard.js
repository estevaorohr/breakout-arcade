(function attachBreakoutLeaderboard(globalScope) {
  function promptForPlayerName(doc = document) {
    return new Promise((resolve) => {
      const modal = doc.getElementById('name-modal');
      const customNameRow = doc.getElementById('custom-name-row');
      const customNameInput = doc.getElementById('custom-name-input');
      const confirmCustomButton = doc.getElementById('confirm-custom-name');
      const optionButtons = Array.from(doc.querySelectorAll('.name-option'));

      const closeModal = () => {
        modal.classList.add('hidden');
        customNameRow.classList.add('hidden');
        customNameInput.value = '';
      };

      const finish = (name) => {
        closeModal();
        resolve(name || 'Anonymous');
      };

      optionButtons.forEach((button) => {
        button.onclick = () => {
          if (button.dataset.name === 'Other') {
            customNameRow.classList.remove('hidden');
            customNameInput.focus();
            return;
          }

          finish(button.dataset.name);
        };
      });

      confirmCustomButton.onclick = () => {
        finish(customNameInput.value.trim());
      };

      modal.onclick = (event) => {
        if (event.target === modal) {
          finish('Anonymous');
        }
      };

      modal.classList.remove('hidden');
    });
  }

  function renderLeaderboard(entries, leaderboardList) {
    leaderboardList.innerHTML = '';

    if (!entries.length) {
      leaderboardList.innerHTML = '<li>No scores yet.</li>';
      return;
    }

    entries.forEach((entry) => {
      const item = document.createElement('li');
      item.innerHTML = `<strong>${entry.name}</strong> — ${entry.score} pts <span>(${entry.date})</span>`;
      leaderboardList.appendChild(item);
    });
  }

  function loadLeaderboard(storageKey, leaderboardList) {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      renderLeaderboard(stored, leaderboardList);
    } catch (error) {
      console.error('Unable to load leaderboard:', error);
      renderLeaderboard([], leaderboardList);
    }
  }

  async function saveHighScore(score, storageKey, maxEntries, leaderboardList) {
    if (score <= 0) return;

    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const qualifies = stored.length < maxEntries || score > (stored[stored.length - 1]?.score || 0);
      if (!qualifies) {
        return;
      }

      const selectedName = await promptForPlayerName(document);
      const entry = {
        name: selectedName || 'Anonymous',
        score,
        date: new Date().toLocaleDateString('en-CA')
      };

      const updated = [...stored, entry].sort((a, b) => b.score - a.score).slice(0, maxEntries);
      localStorage.setItem(storageKey, JSON.stringify(updated));
      renderLeaderboard(updated, leaderboardList);
    } catch (error) {
      console.error('Unable to save leaderboard:', error);
    }
  }

  globalScope.BreakoutLeaderboard = {
    promptForPlayerName,
    renderLeaderboard,
    loadLeaderboard,
    saveHighScore
  };
})(typeof window !== 'undefined' ? window : globalThis);
