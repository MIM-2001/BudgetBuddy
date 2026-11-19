const SPENDING_GOAL = 0.80;
const CHALLENGE_DAYS = 7;



function weeklyAverage(envelopeId) {
  const fourWeeksAgo = new Date(startOfToday().getTime() - 28 * DAY_MS);
  const spent = spentBetween(envelopeId, fourWeeksAgo, new Date());
  return spent / 4;
}



function nextLevel(envelopeId) {
  return 1;
}



function hasActiveChallenge(envelopeId) {
  for (const challenge of Store.getState().challenges) {
    if (challenge.envelopeId === envelopeId && challenge.status === 'active') return true;
  }
  return false;
}


function suggestChallenges() {
  const ideas = [];

  for (const envelope of Store.getState().envelopes) {
    
    const name = envelope.name.toLowerCase();

    if (name.includes('rent') || name.includes('tuition')){
      continue;
    }
    

    if (hasActiveChallenge(envelope.id)){
      continue;
    }

    const average = weeklyAverage;(envelope.id);

    if (average < 10){
      continue;
    }

    const limit = Math.round(average * SPENDING_GOAL);


    ideas.push({
      envelopeId: envelope.id,
      weekly: average,
      limit: limit
    })

    return ideas.slice(0, 2);

  }

  
}



function startChallenge(envelopeId) {
  
  if (hasActiveChallenge(envelopeId)){
    return;
  }

  const average = weeklyAverage(envelopeId);

  if (average < 10) {
    return;
  }

  const limit = Math.round(average * SPENDING_GOAL);

  const start = startOfToday();

  const end = new Date(start);

  end.setDate(end.getDate() + CHALLENGE_DAYS);
  end.setMilliseconds(end.getMilliseconds() - 1);


  Store.addChallenge({
    envelopeId: envelopeId,
    limit: limit,
    start: start.toISOString(),
    end: end.toISOString(),
    status: 'active'
  })
}



function updateChallenges() {
  const today = new Date();

  for (const challenge of Store.getState().challenges)
  {
    
    if (challenge.status !== 'active')
    {
      continue;
    }

    const end = new Date();

    if (today <= end) 
    {
      continue;
    }

    const spent = spentBetween(
      challenge.envelopeId,
      new Date(challenge.start),
      end
    );

    if (spent <= challenge.limit)
    {

      Store.updateChallenge(challenge.id, { status: 'won'});

    } else {

      Store.updateChallenge(challenge.id, {status: 'lost'});

    }

  }

}


function renderChallenges() {
  const list = document.getElementById('challengeList');
  if (!list) return;

  let html = '';
  let wins = 0;

  for (const challenge of Store.getState().challenges) {
    if (challenge.status === 'won') wins++;
    if (challenge.status !== 'active') continue;

    const envelope = envelopeById(challenge.envelopeId);
    if (!envelope) continue; 

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


document.addEventListener('click', function (event) {
  const button = event.target.closest('[data-start-challenge]');
  if (!button) return;

  startChallenge(button.dataset.startChallenge);
  renderChallenges();

  button.textContent = 'Challenge started!';
  button.disabled = true;
});
