/* =========================================================================
   FEATURE 3: SPENDING HABIT CHALLENGES

   Key points:
   - Suggests "Spend under $X on <category> this week" for the 2
     categories the user spends the most on.
   - X is based on what they usually spend in a week (last 4 weeks),
     minus 10% (Easy), 20% (Medium) or 30% (Hard).
   - Skips rent and tuition (you can't cut those) and categories under
     $10 a week.
   - Difficulty adapts: win 2 in a row in a category -> next one is harder,
     lose 2 in a row -> next one is easier.
   - A challenge lasts 7 days. Going over the limit = lost right away.
     Making it to the end under the limit = won.
   - Challenges are saved in Store, so they sync to Google Drive.
   - affordability.js calls suggestChallenges() to offer a challenge
     when the user can't afford something.
   ========================================================================= */

const LEVELS = ['Easy', 'Medium', 'Hard'];
const LEVEL_CUTS = [0.10, 0.20, 0.30]; // how much to cut for each level
const CHALLENGE_DAYS = 7;

/**
 * How much the user usually spends in a category per week.
 * Looks at the last 4 weeks and divides by 4.
 * @param {string} envelopeId
 * @returns {number} dollars per week
 */
function weeklyAverage(envelopeId) {
  const fourWeeksAgo = new Date(startOfToday().getTime() - 28 * DAY_MS);
  const spent = spentBetween(envelopeId, fourWeeksAgo, new Date());
  return spent / 4;
}

/**
 * Picks the difficulty for the next challenge in a category,
 * based on how the last two went.
 * @param {string} envelopeId
 * @returns {number} 0 = Easy, 1 = Medium, 2 = Hard
 */
function nextLevel(envelopeId) {
  // Finished challenges in this category, oldest first
  const finished = [];
  for (const challenge of Store.getState().challenges) {
    if (challenge.envelopeId === envelopeId && challenge.status !== 'active') {
      finished.push(challenge);
    }
  }

  if (finished.length === 0) return 0; // first time: start easy

  let level = finished[finished.length - 1].level;

  if (finished.length >= 2) {
    const last = finished[finished.length - 1].status;
    const secondLast = finished[finished.length - 2].status;
    if (last === 'won' && secondLast === 'won') level = level + 1;
    if (last === 'lost' && secondLast === 'lost') level = level - 1;
  }

  // Keep it between Easy (0) and Hard (2)
  if (level > 2) level = 2;
  if (level < 0) level = 0;
  return level;
}

/**
 * Checks if a category already has a challenge running.
 * @param {string} envelopeId
 * @returns {boolean}
 */
function hasActiveChallenge(envelopeId) {
  for (const challenge of Store.getState().challenges) {
    if (challenge.envelopeId === envelopeId && challenge.status === 'active') return true;
  }
  return false;
}

/**
 * Comes up with challenge ideas for the user's 2 biggest categories.
 * @returns {Array} ideas like { envelopeId, weekly, level, limit }
 */
function suggestChallenges() {
  const ideas = [];

  for (const envelope of Store.getState().envelopes) {
    const name = envelope.name.toLowerCase();
    if (name.includes('rent') || name.includes('tuition')) continue; // can't cut these
    if (hasActiveChallenge(envelope.id)) continue;                  // already doing one

    const weekly = weeklyAverage(envelope.id);
    if (weekly < 10) continue; // not worth a challenge

    const level = nextLevel(envelope.id);
    const limit = Math.round(weekly * (1 - LEVEL_CUTS[level]));
    ideas.push({ envelopeId: envelope.id, weekly: weekly, level: level, limit: limit });
  }

  // Biggest spender first, then keep the top 2
  ideas.sort(function (a, b) { return b.weekly - a.weekly; });
  return ideas.slice(0, 2);
}

/**
 * Starts a 7-day challenge in a category and saves it.
 * @param {string} envelopeId
 */
function startChallenge(envelopeId) {
  // One at a time per category, so tapping Start twice can't make two
  if (hasActiveChallenge(envelopeId)) return;

  const weekly = weeklyAverage(envelopeId);
  const level = nextLevel(envelopeId);
  const limit = Math.round(weekly * (1 - LEVEL_CUTS[level]));
  if (limit <= 0) return;

  const start = startOfToday();
  const end = new Date(start.getTime() + CHALLENGE_DAYS * DAY_MS - 1); // end of day 7

  Store.addChallenge({
    envelopeId: envelopeId,
    level: level,
    limit: limit,
    start: start.toISOString(),
    end: end.toISOString(),
    status: 'active',
  });
}

/**
 * Checks each running challenge and marks it 'won' or 'lost' if it's over.
 * Runs every time the app re-renders, so new expenses count right away.
 */
function updateChallenges() {
  const now = new Date();

  for (const challenge of Store.getState().challenges) {
    if (challenge.status !== 'active') continue;

    const spent = spentBetween(challenge.envelopeId, new Date(challenge.start), new Date(challenge.end));

    if (spent > challenge.limit) {
      Store.updateChallenge(challenge.id, { status: 'lost' });
    } else if (now > new Date(challenge.end)) {
      Store.updateChallenge(challenge.id, { status: 'won' });
    }
  }
}

/**
 * Draws the running challenges (with a progress bar) and the new ideas.
 */
function renderChallenges() {
  const list = document.getElementById('challengeList');
  if (!list) return;

  let html = '';
  let wins = 0;

  // Running challenges
  for (const challenge of Store.getState().challenges) {
    if (challenge.status === 'won') wins++;
    if (challenge.status !== 'active') continue;

    const envelope = envelopeById(challenge.envelopeId);
    if (!envelope) continue; // category was deleted

    const spent = spentBetween(challenge.envelopeId, new Date(challenge.start), new Date(challenge.end));
    let percent = (spent / challenge.limit) * 100;
    if (percent > 100) percent = 100;
    const daysLeft = Math.ceil((new Date(challenge.end) - new Date()) / DAY_MS);

    html += '<div class="envelope">'
      + '<div class="env-top">'
      + '<span class="env-name">' + envelope.name + ' under ' + money(challenge.limit) + ' · ' + LEVELS[challenge.level] + '</span>'
      + '<span class="env-nums"><b>' + money(spent) + '</b> / ' + money(challenge.limit) + '</span>'
      + '</div>'
      + '<div class="env-track"><div class="env-fill" style="width:' + percent + '%"></div></div>'
      + '<div class="row-meta">' + daysLeft + ' days left</div>'
      + '</div>';
  }

  // New ideas
  for (const idea of suggestChallenges()) {
    const envelope = envelopeById(idea.envelopeId);
    html += '<div class="row">'
      + '<span class="row-name">Spend under ' + money(idea.limit) + ' on ' + envelope.name + ' this week'
      + '<div class="row-meta">' + LEVELS[idea.level] + ' · you usually spend ' + money(idea.weekly) + '</div></span>'
      + '<span class="row-leader"></span>'
      + '<button class="btn-text" data-start-challenge="' + idea.envelopeId + '">Start</button>'
      + '</div>';
  }

  if (html === '') {
    html = '<div class="empty">Log a few weeks of spending and challenges will show up here.</div>';
  }

  list.innerHTML = html;
  document.getElementById('challengeWins').textContent = wins > 0 ? wins + ' won' : '';
}

/* ---- "Start" buttons (here and in affordability.js) ---- */
document.addEventListener('click', function (event) {
  const button = event.target.closest('[data-start-challenge]');
  if (!button) return;

  startChallenge(button.dataset.startChallenge);
  renderChallenges();

  // The button in the afford popup stays on screen, so show that it worked
  button.textContent = 'Challenge started!';
  button.disabled = true;
});
