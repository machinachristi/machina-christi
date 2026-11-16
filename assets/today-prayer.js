// "A prayer for today": one small rule, kept in one place so any page can ask
// it. Given a date and (when known) the name of the day's celebration, it
// answers with one prayer from the Pray pages and a short reason for it.
//
//   mcTodayPrayer(new Date(), 'Our Lady of Sorrows')
//     -> { id: 'hail-holy-queen', title: 'Hail, Holy Queen', title_th: '…', why: 'A day of Our Lady' }
//
// The titles are copied from pray/prayers.json; tests/ordo.spec.js fails if
// the two ever disagree, or if a prayer named here stops existing.
(() => {
  'use strict';

  const PRAYERS = {
    'glory-be':          ['Glory Be', 'บทพระสิริรุ่งโรจน์'],
    'our-father':        ['The Our Father', 'บทข้าแต่พระบิดา'],
    'angel-of-god':      ['Angel of God', 'บททูตสวรรค์ของพระเจ้า'],
    'apostles-creed':    ['The Apostles’ Creed', 'บทข้าพเจ้าเชื่อ (สัญลักษณ์ของอัครสาวก)'],
    'mass':              ['The Mass', 'พิธีบูชาขอบพระคุณ'],
    'o-blood-and-water': ['O Blood and Water', 'โอ้ พระโลหิตและน้ำ'],
    'hail-mary':         ['The Hail Mary', 'บทวันทามารีย์'],
    'hail-holy-queen':   ['Hail, Holy Queen', 'บทวันทาพระราชินี'],
  };

  // Sunday first, as Date.getDay() counts.
  const BY_WEEKDAY = [
    ['glory-be', 'Sunday is the Lord’s day'],
    ['our-father', 'The prayer Jesus taught, to begin the week'],
    ['angel-of-god', 'Tuesday is kept for the holy angels'],
    ['apostles-creed', 'Midweek: the faith we hold'],
    ['mass', 'Thursday remembers the Last Supper'],
    ['o-blood-and-water', 'Friday remembers the Cross'],
    ['hail-mary', 'Saturday is Our Lady’s day'],
  ];

  // A few kinds of day outrank the weekday. First match wins.
  const BY_FEAST = [
    [/Divine Mercy/, 'o-blood-and-water', 'Divine Mercy Sunday'],
    [/Angels\b|Archangels\b/, 'angel-of-god', 'A feast of the angels'],
    // (not Saint Joseph, "Husband of the Blessed Virgin Mary", nor her parents;
    // and an ordinary Saturday kept in her memory stays with the Hail Mary)
    [/^(?!Saints? |Saturday Memorial).*(Blessed Virgin Mary|Our Lady|Mother of God)/, 'hail-holy-queen', 'A day of Our Lady'],
  ];

  function todayPrayer(date, feastName) {
    let [id, why] = BY_WEEKDAY[date.getDay()];
    const feast = feastName && BY_FEAST.find(([re]) => re.test(feastName));
    if (feast) [, id, why] = feast;
    return { id, title: PRAYERS[id][0], title_th: PRAYERS[id][1], why };
  }

  todayPrayer.prayers = PRAYERS;
  window.mcTodayPrayer = todayPrayer;
})();
