import { rt } from '../core/runtime.js';
import { isChinese, tContractLabel, tMutatorBlurb, tMutatorName, tRewardLabel } from '../core/i18n.js';

var lastSig = '';

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function rewardMark(reward) {
  if (!reward) return '·';
  if (reward.type === 'reroll') return '↻';
  if (reward.type === 'repair') return '+';
  return '✦';
}

function progressText(contract) {
  var zh = isChinese();
  var label = (zh && contract.id ? tContractLabel(contract.id) : null) || contract.label || contract.id || (zh ? '合約' : 'CONTRACT');
  var goal = contract.goal || 1;
  var progress = contract.progress || 0;
  if (contract.id === 'no-damage') progress = Math.floor(progress);
  if (progress > goal) progress = goal;
  return label + ' ' + progress + '/' + goal;
}

export function updateContractsHud() {
  if (typeof document === 'undefined') return;
  var root = document.getElementById('contractTracker');
  if (!root || !rt.state) return;
  var zh = isChinese();
  var contract = rt.state.contract;
  var mutator = rt.state.mutator;
  var mutId = mutator && typeof mutator === 'object' ? mutator.id : (typeof mutator === 'string' ? mutator : '');
  var cId = contract && contract.id ? contract.id : '';
  var progress = contract && contract.progress ? Math.floor(contract.progress * 10) : 0;
  var sig = cId + '|' + progress + '|' + (contract && contract.done ? 1 : 0) + '|' + (contract && contract.resets ? contract.resets : 0) + '|' + mutId + '|' + (zh ? 'zh' : 'en');
  if (!cId && !mutId) {
    lastSig = '';
    root.hidden = true;
    root.replaceChildren();
    return;
  }
  if (sig === lastSig) return;
  lastSig = sig;
  root.hidden = false;
  root.replaceChildren();
  root.setAttribute('aria-live', 'polite');
  if (mutId) {
    var chip = el('div', 'mutator-chip');
    chip.appendChild(el('span', 'mutator-kicker', zh ? '變異因子' : 'MUTATOR'));
    chip.appendChild(el('strong', null, (zh ? tMutatorName(mutId) : null) || mutator.name || mutId));
    var blurb = (zh ? tMutatorBlurb(mutId) : null) || mutator.blurb;
    if (blurb) chip.appendChild(el('small', null, blurb));
    root.appendChild(chip);
  }
  if (cId) {
    var card = el('div', 'contract-card' + (contract.done ? ' is-complete' : '') + (contract.resets ? ' is-reset' : ''));
    card.appendChild(el('span', 'contract-kicker', zh ? '作戰合約' : 'CONTRACT'));
    card.appendChild(el('strong', null, progressText(contract)));
    var rewText = (zh ? tRewardLabel(contract.reward) : null) || (contract.reward && contract.reward.label) || '';
    var reward = el('em', 'contract-reward', rewText);
    reward.setAttribute('aria-hidden', 'true');
    reward.dataset.mark = rewardMark(contract.reward);
    card.appendChild(reward);
    if (contract.done) card.appendChild(el('span', 'contract-check', zh ? '已達成' : 'SEALED'));
    root.appendChild(card);
  }
}
