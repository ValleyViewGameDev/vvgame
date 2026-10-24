// The day-2 gift (docs/early-game.md §1, backlog OB-3): a new player who finished the FTUE and
// opens the game again on a later calendar day (their own day, from the client's timezone offset)
// gets one bigger Mailbox gift, messages.json row RETURN_GIFT_MESSAGE_ID. The FTUE's last toast
// promises it. New accounts start with `returnGift: false`; older accounts have no field and never
// get it. The claim is one atomic update, so two app loads at once cannot send it twice.

const Player = require('../models/player');
const sendMailboxMessage = require('./messageUtils');

const RETURN_GIFT_MESSAGE_ID = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

// the calendar day of a time for a client whose Date.getTimezoneOffset() is offsetMin
const localDay = (ms, offsetMin) => Math.floor((ms - offsetMin * 60000) / DAY_MS);

/** Mails the day-2 gift when it is due. Returns the message as stored (for the client), or null. */
async function maybeSendReturnGift(playerId, tzOffset, io = null) {
  const offset = Number.isFinite(tzOffset) && Math.abs(tzOffset) <= 840 ? tzOffset : 0;
  const player = await Player.findById(playerId, 'created returnGift firsttimeuser').lean();
  if (!player || player.returnGift !== false || player.firsttimeuser === true || !player.created) return null;
  if (localDay(Date.now(), offset) <= localDay(new Date(player.created).getTime(), offset)) return null;

  const claimed = await Player.updateOne({ _id: playerId, returnGift: false }, { $set: { returnGift: true } });
  if (!claimed.modifiedCount) return null;
  await sendMailboxMessage(String(playerId), RETURN_GIFT_MESSAGE_ID, [], io);
  return { messageId: RETURN_GIFT_MESSAGE_ID, timestamp: new Date(), read: false, collected: false, neverPurge: false };
}

module.exports = { maybeSendReturnGift, RETURN_GIFT_MESSAGE_ID };
