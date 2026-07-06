#!/usr/bin/env python3
"""One-off maintenance script: builds ordo/saints.json, a curated table of
saint bio excerpts trimmed from Butler's Lives of the Saints (1894, public
domain), keyed by the exact celebration name string used in ordo/calendar-*.json.

Source: catholicsaints.info hosts Butler's full text, one saint per page.
Butler organized his book by the OLD (pre-Vatican II) calendar and titles, so
a page's slug/title often doesn't match the modern General Roman Calendar
name at all (e.g. modern "Saint Augustine, Bishop and Doctor of the Church"
is Butler's "Saint Augustine, Bishop and Confessor, Doctor of the Church";
modern "Saint Thomas Aquinas" is Butler's "Saint Thomas of Aquino"). So
candidates are found via the site's search API, then re-ranked by Jaccard
token overlap between the modern celebration name and each candidate's
title, which in practice disambiguates same-named saints reliably (e.g.
"Augustine, Bishop and Doctor of the Church" scores far higher against the
Hippo entry than against "Augustine, Archbishop of Canterbury").

Keying bios by the calendar JSON's own `name` string (rather than an
independently-normalized saint name) sidesteps runtime fuzzy matching
entirely: both files come from the same litcal snapshot, so an exact-match
lookup at page-render time is sufficient. Saints Butler doesn't cover (mainly
post-1894 canonizations) fall back to SUPPLEMENTAL_BIOS below — hand-written
entries sourced from an official vatican.va biography where the Holy See has
published one, or otherwise from public facts (mainly Wikipedia) rewritten
here in the Church's own devotional voice. Saints with neither a Butler entry
nor a supplemental one still fall back to a "bio not yet available" notice.

Usage: python3 scripts/build-saints.py
"""
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

SEARCH_API = "https://catholicsaints.info/wp-json/wp/v2/search"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; machinachristi-ordo-build/1.0)"}
STOPWORDS = {"saint", "saints", "the", "of", "and", "a", "an"}

# Multi-person feasts, or cases where the natural search core needs a nudge.
# Each override is the "person name" to search for; the first hit found wins.
SEARCH_OVERRIDES = {
    "Saints Michael, Gabriel and Raphael, Archangels": ["Michael the Archangel"],
    "Saints Cornelius, Pope, and Cyprian, Bishop, Martyrs": ["Cornelius Pope Martyr", "Cyprian Bishop Martyr"],
    "Saints Cyril, Monk, and Methodius, Bishop": ["Cyril Methodius"],
    "Saints Pontian, Pope, and Hippolytus, Priest, Martyrs": ["Pontian Pope Martyr", "Hippolytus Priest Martyr"],
    "Saints John de Brébeuf and Isaac Jogues, Priests, and Companions, Martyrs": ["John de Brebeuf", "Isaac Jogues"],
    "Saints Joachim and Anne, Parents of the Blessed Virgin Mary": ["Joachim", "Anne"],
    "Saint Joseph Husband of the Blessed Virgin Mary": ["Joseph Spouse Blessed Virgin Mary"],
    "Saints Perpetua and Felicity, Martyrs": ["Perpetua"],
    "Saint Frances of Rome, Religious": ["Frances Widow Foundress Collatines"],
    "Saint Hedwig, Religious": ["Hedwig Poland"],
    "Saint John of Capestrano, Priest": ["Capistran"],
    # Post-1894 canonizations: Butler (d. 1773, published 1894 ed.) cannot cover these.
    "Saint Andrew Dũng-Lạc, Priest, and Companions, Martyrs": [],
    "Saint Andrew Kim Tae-gŏn, Priest, and Paul Chŏng Ha-sang, and Companions, Martyrs": [],
    "Saint Christopher Magallanes, Priest, and Companions, Martyrs": [],
    "Saint Augustine Zhao Rong, Priest, and Companions, Martyrs": [],
    "Saint Faustina Kowalska": [],
    "Saint John Paul II, Pope": [],
    "Saint John XXIII, Pope": [],
    "Saint Paul VI, Pope": [],
    "Saint Teresa of Calcutta, Virgin": [],
    "Saint Pius of Pietrelcina, Priest": [],
    "Saint Gregory of Narek, Abbot and Doctor of the Church": [],
    "Saint Juan Diego Cuauhtlatoatzin": [],
    "Saint Josaphat, Bishop and Martyr": ["Josaphat Bishop Martyr"],
}

# Butler (1894) uses 19th-century English spellings/forms that differ from
# the modern General Roman Calendar names for the same person — without this,
# token overlap scoring misses obvious matches (e.g. modern "Anthony" vs
# Butler's "Antony", "Catherine of Siena" vs "Catharine of Sienna").
SPELLING_GROUPS = [
    {"anthony", "antony"}, {"catherine", "catharine"}, {"siena", "sienna"},
    {"cecilia", "cecily"}, {"wenceslaus", "wenceslas"}, {"louis", "lewis"},
    {"felicity", "felicitas"}, {"hedwig", "hedwiges"},
    {"jerome", "jerom"}, {"emiliani", "aemiliani"}, {"capestrano", "capistran"},
]
SPELLING_MAP = {w: sorted(g)[0] for g in SPELLING_GROUPS for w in g}

def stem(word):
    return word[:-1] if len(word) > 4 and word.endswith("s") else word

def tokens(text):
    out = set()
    for t in re.findall(r"[a-z]+", text.lower()):
        if t in STOPWORDS:
            continue
        t = stem(SPELLING_MAP.get(t, t))
        out.add(t)
    return out

# Manually verified URLs for entries whose Butler-era descriptor diverges
# from the modern name too much for the Jaccard score to clear its threshold.
DIRECT_URLS = {
    "Saint Hedwig, Religious": "https://catholicsaints.info/butlers-lives-of-the-saints-saint-hedwiges-or-avoice-duchess-of-poland-widow/",
    "Saint Frances of Rome, Religious": "https://catholicsaints.info/butlers-lives-of-the-saints-saint-frances-widow-foundress-of-the-collatines/",
    # Butler's old-calendar title for this saint uses his baptismal name "Alphonsus"
    # ahead of "Turibius", which sinks the Jaccard score below threshold.
    "Saint Turibius of Mogrovejo, Bishop": "https://catholicsaints.info/butlers-lives-of-the-saints-saint-alphonsus-turibius-bishop-and-confessor/",
}

# Saints with no Butler's Lives entry at all — either canonized after Butler's
# 1894 edition, or (rarely) old enough that Butler's Western-only scope never
# covered them (e.g. Gregory of Narek, an Armenian monk). Per-saint sourcing
# priority: an official vatican.va biography, homily, or doctoral proclamation
# where the Holy See has published one; otherwise a bio written here from
# public facts (mainly Wikipedia), kept in the Church's own devotional voice —
# deliberately excluding secular commentary/criticism that a Wikipedia article
# might carry, since this page presents saints from the Church's perspective.
# source_name overrides the default "Butler's Lives of the Saints (1894)"
# attribution rendered in ordo.html.
SUPPLEMENTAL_BIOS = {
    "Saint Albert the Great, Bishop and Doctor of the Church": {
        "excerpt": "Albert of Cologne, called “the Great” for the breadth of his learning, entered the Order of Preachers and gave himself with equal devotion to the study of nature and of God. He taught the young Thomas Aquinas at Cologne and Paris, holding that the truths uncovered by reason and the truths revealed by faith could never truly contradict one another, since both flow from the same God. Named Bishop of Regensburg, he chose in the end to return to a life of teaching and prayer among his brethren. The Church honors him as Doctor Universalis and patron of those who study the natural world.",
        "source_url": "https://www.vatican.va/content/benedict-xvi/en/audiences/2010/documents/hf_ben-xvi_aud_20100324.html",
        "source_name": "Vatican.va",
    },
    "Saint Alphonsus Mary Liguori, Bishop and Doctor of the Church": {
        "excerpt": "Alphonsus Maria de’ Liguori, a Neapolitan lawyer who abandoned a brilliant career at the bar to become a priest, spent his life among the poor and neglected of the Italian countryside, preaching missions and hearing confessions with great gentleness. He founded the Congregation of the Most Holy Redeemer to carry on this work, and though later made a bishop, longed always for the simplicity of missionary life. His many writings on moral theology and prayer earned him renown as patron of confessors and moral theologians, and Pope Pius IX declared him a Doctor of the Church.",
        "source_url": "https://catholicsaints.info/general-audience-of-pope-benedict-xvi-30-march-2011-saint-alphonsus-liguori/",
        "source_name": "Vatican.va",
    },
    "Saint Andrew Dũng-Lạc, Priest, and Companions, Martyrs": {
        "excerpt": "Andrew Dũng-Lạc was a Vietnamese priest who labored for the Gospel under the harsh persecutions of Emperor Minh Mạng, when foreign missionaries were banned and the faithful were pressed to trample the cross underfoot. Arrested and ransomed more than once, he continued to minister in secret until he was finally taken and beheaded in 1839. He is honored together with one hundred and sixteen companions — bishops, priests, and lay faithful of Vietnam — who over three centuries gave their lives rather than deny Christ. Pope John Paul II canonized them together in 1988 as the Martyrs of Vietnam.",
        "source_url": "https://en.wikipedia.org/wiki/Andrew_D%C5%A9ng-L%E1%BA%A1c",
        "source_name": "Wikipedia",
    },
    "Saint Andrew Kim Tae-gŏn, Priest, and Paul Chŏng Ha-sang, and Companions, Martyrs": {
        "excerpt": "Andrew Kim Tae-gŏn was the first native Korean ordained a priest, traveling to Shanghai for the sacrament before returning in secret to serve the persecuted Church of his homeland; he was captured and beheaded near Seoul in 1846, at twenty-five. Paul Chŏng Ha-sang, a lay catechist and married man, had labored for years to plead the cause of Korea’s Christians before the government, and was martyred some years earlier. They are venerated with over a hundred companions who died in Korea’s nineteenth-century persecutions. Pope John Paul II canonized them in Seoul in 1984.",
        "source_url": "https://en.wikipedia.org/wiki/Andrew_Kim_Taegon",
        "source_name": "Wikipedia",
    },
    "Saint Angela Merici, Virgin": {
        "excerpt": "Angela Merici, a laywoman of Brescia devoted from her youth to prayer and works of charity, gathered a company of young women committed to lives of virginity and service in the world, without withdrawing behind convent walls. From this small beginning grew the Company of Saint Ursula, dedicated above all to the Christian education of girls. She died in 1540, and Pope Pius VII canonized her, recognizing in her humble undertaking a great gift to the Church’s mission of teaching.",
        "source_url": "https://en.wikipedia.org/wiki/Angela_Merici",
        "source_name": "Wikipedia",
    },
    "Saint Anthony Mary Claret, Bishop": {
        "excerpt": "Anthony Mary Claret, a Catalan priest of tireless zeal, spent years preaching missions throughout Catalonia before being sent as Archbishop to Santiago de Cuba, where he labored for the reform of his clergy and the instruction of the poor despite fierce opposition. He founded the Claretians to continue the work of preaching to which he had given his life, and later served as confessor to Queen Isabella II of Spain. He died in exile in 1870, and Pope Pius XII canonized him in 1950.",
        "source_url": "https://en.wikipedia.org/wiki/Anthony_Mary_Claret",
        "source_name": "Wikipedia",
    },
    "Saint Anthony Zaccaria, Priest": {
        "excerpt": "Anthony Mary Zaccaria, a physician of Cremona who turned from medicine to the priesthood, founded the Clerics Regular of Saint Paul — the Barnabites — to labor for the renewal of Christian life in Milan through preaching and the sacraments. He was a tireless promoter of frequent Communion and of public devotions such as the Forty Hours, seeking to rekindle fervor in a Church troubled by the disorders of his age. He died in 1539 at only thirty-six, and Pope Leo XIII canonized him in 1897.",
        "source_url": "https://en.wikipedia.org/wiki/Anthony_Mary_Zaccaria",
        "source_name": "Wikipedia",
    },
    "Saint Augustine Zhao Rong, Priest, and Companions, Martyrs": {
        "excerpt": "Augustine Zhao Rong was a Chinese soldier assigned to escort a French missionary bishop to his execution; so struck was he by the bishop’s composure in the face of death that he was converted, and in time became the first Chinese-born priest to himself die a martyr’s death. He is honored with one hundred and nineteen companions — bishops, priests, religious, and lay faithful of China, including many children — martyred over some two and a half centuries. Pope John Paul II canonized them together as the Martyrs of China in 2000.",
        "source_url": "https://www.vatican.va/content/john-paul-ii/en/homilies/2000/documents/hf_jp-ii_hom_20001001_canonization.html",
        "source_name": "Vatican.va",
    },
    "Saint Bernardine of Siena, Priest": {
        "excerpt": "Bernardine of Siena, a Franciscan friar renowned for the fire of his preaching, traveled tirelessly through the cities of Italy urging peace between warring factions and devotion to the Holy Name of Jesus, which he had inscribed on a tablet — the monogram IHS — and held up before the crowds who came to hear him. He worked to restore discipline and fervor within the Franciscan Order, and though repeatedly urged toward the episcopacy, preferred to remain a simple preacher of the Gospel. He died in 1444, and so evident was his holiness that Pope Nicholas V canonized him only six years later.",
        "source_url": "https://en.wikipedia.org/wiki/Bernardino_of_Siena",
        "source_name": "Wikipedia",
    },
    "Saint Charles Lwanga and Companions, Martyrs": {
        "excerpt": "Charles Lwanga served as head of the royal pages at the court of King Mwanga II of Buganda, and used his position to shelter the young men in his care from the king’s abuses while instructing them secretly in the Catholic faith. When the king turned violently against the growing community of Christians at court, Charles and his companions refused to renounce their faith and were burned alive in 1886. Twenty-two Catholic martyrs of Uganda are honored together on this day, alongside Anglican companions who died in the same persecution. Pope Paul VI canonized them in 1964, during the Second Vatican Council.",
        "source_url": "https://en.wikipedia.org/wiki/Charles_Lwanga",
        "source_name": "Wikipedia",
    },
    "Saint Christopher Magallanes, Priest, and Companions, Martyrs": {
        "excerpt": "Christopher Magallanes was a Mexican priest who worked to reopen seminaries closed during the anticlerical persecutions that followed the Mexican Revolution, and who preached against armed rebellion even as violence engulfed the country. He was arrested on false charges of inciting revolt while on his way to celebrate Mass, and was executed without trial in 1927, declaring that he died innocent and asking that his blood might serve to unite his Mexican brethren. He is honored with twenty-four companion priests and laymen martyred in the same persecution, the Cristero martyrs. Pope John Paul II canonized them together in 2000.",
        "source_url": "https://en.wikipedia.org/wiki/Crist%C3%B3bal_Magallanes_Jara",
        "source_name": "Wikipedia",
    },
    "Saint Damasus I, Pope": {
        "excerpt": "Damasus, a Roman deacon of Spanish descent, was elected pope in 366 amid a bitterly disputed succession, and went on to govern the Church through nearly two decades of theological turmoil. He commissioned Saint Jerome to revise the Latin translations of Scripture, work that grew into the Vulgate Bible used by the Church for centuries after. He defended the Nicene faith against the Arian heresy, presided over a Roman council that affirmed the canon of the New Testament, and did much to restore and honor the tombs of Rome’s early martyrs, composing verse epitaphs for their shrines. He died in 384, having guided the Church from persecution’s aftermath toward its settled place in the Christian empire.",
        "source_url": "https://en.wikipedia.org/wiki/Pope_Damasus_I",
        "source_name": "Wikipedia",
    },
    "Saint Faustina Kowalska": {
        "excerpt": "Faustina Kowalska, a Polish religious sister of humble education, recorded in her spiritual diary the visions and words of Our Lord entrusted to her, above all his call to trust in the Divine Mercy and to make it known to the world. Despite suffering and the doubts of others during her lifetime, she remained faithful to this mission until her death in 1938. From her witness arose the devotion to the Divine Mercy and its image, now beloved throughout the Church. Pope John Paul II canonized her in the Jubilee Year 2000 and established Divine Mercy Sunday in her honor.",
        "source_url": "https://www.vatican.va/news_services/liturgy/saints/ns_lit_doc_20000430_faustina_en.html",
        "source_name": "Vatican.va",
    },
    "Saint Gregory of Narek, Abbot and Doctor of the Church": {
        "excerpt": "Gregory of Narek, a monk of the Armenian monastery of Narek, gave himself to a life of prayer, study, and poetic composition in praise of God, leaving to the Church his Book of Lamentations — a work of profound spiritual depth treasured for a thousand years by Armenian Christians. Though he lived centuries before the schism that would separate the Armenian Church from Rome, his sanctity and his gift for expressing the soul’s cry to God are recognized by Catholics and Armenians alike. Pope Francis declared him a Doctor of the Church in 2015, the first son of the Armenian Church so honored.",
        "source_url": "https://www.vatican.va/content/francesco/en/apost_letters/documents/papa-francesco_lettera-ap_2015412_gregorius-narecensis-doctor-ecclesiae.html",
        "source_name": "Vatican.va",
    },
    "Saint John Baptist de la Salle, Priest": {
        "excerpt": "John Baptist de la Salle, a priest and canon of Reims born to a family of means, gave up his benefices and inheritance to devote himself entirely to the education of poor children, for whom there was then little provision. He founded the Brothers of the Christian Schools, gathering laymen into a religious community dedicated to teaching, and pioneered methods still used today — instruction in the students’ own tongue rather than Latin, and the training of teachers as a vocation in itself. He died in 1719, and Pope Pius XII later named him patron of all who teach.",
        "source_url": "https://en.wikipedia.org/wiki/Jean-Baptiste_de_La_Salle",
        "source_name": "Wikipedia",
    },
    "Saint John Bosco, Priest": {
        "excerpt": "John Bosco, a priest of Turin who had known poverty in his own youth, gave his life to the care of poor and abandoned boys drawn to the city by the growing factories of his age. Rather than rely on harsh discipline, he formed what he called the Preventive System, rooted in kindness, reason, and religion, and founded the Salesians to carry on this work of education long after his death in 1888. Pope Pius XI canonized him in 1934, honoring him as father and teacher of youth.",
        "source_url": "https://en.wikipedia.org/wiki/John_Bosco",
        "source_name": "Wikipedia",
    },
    "Saint John Eudes, Priest": {
        "excerpt": "John Eudes, a French priest of Normandy, spent years preaching missions across the countryside and caring for the spiritual and physical needs of the abandoned. He founded the Congregation of Jesus and Mary to train priests for the reform of the clergy, and was among the first to promote devotion to the Sacred Heart of Jesus and the Immaculate Heart of Mary as a united object of love and imitation. He died in 1680, and Pope Pius XI canonized him in 1925.",
        "source_url": "https://catholicsaints.info/general-audience-of-pope-benedict-xvi-19-august-2009-saint-john-eudes-and-the-formation-of-the-diocesan-clergy/",
        "source_name": "Vatican.va",
    },
    "Saint John Mary Vianney, Priest": {
        "excerpt": "John Mary Vianney, a priest of humble intellect but immense charity, was sent to the obscure parish of Ars in rural France, where his preaching, his penances, and above all his tireless hours in the confessional — sometimes sixteen a day — drew pilgrims from across the country seeking peace for their souls. He bore great interior trials, as he himself testified, yet never wavered in his devotion to the sacrament of penance and to the souls entrusted to him. He died in 1859, and Pope Pius XI canonized him in 1925 as patron of parish priests.",
        "source_url": "https://catholicsaints.info/general-audience-of-pope-benedict-xvi-5-august-2009-saint-john-mary-vianney-the-holy-cure-of-ars/",
        "source_name": "Vatican.va",
    },
    "Saint John Paul II, Pope": {
        "excerpt": "Karol Wojtyła, a Polish priest who had labored as a young man under both Nazi occupation and Communist rule, was elected pope in 1978 and became one of the most far-traveled popes in history, carrying the Gospel to every continent and gathering the young at World Youth Day. He survived an assassin’s bullet in Saint Peter’s Square in 1981, and publicly forgave the man who had shot him. Through a long pontificate he helped guide the Church through the last years of the Cold War and into a new millennium. He died in 2005, and Pope Francis canonized him in 2014.",
        "source_url": "https://www.vatican.va/content/john-paul-ii/en/biografia.index.html",
        "source_name": "Vatican.va",
    },
    "Saint John XXIII, Pope": {
        "excerpt": "Angelo Roncalli, elected pope in 1958 at seventy-six and expected by many to be a brief, transitional pontiff, surprised the Church by convening the Second Vatican Council, seeking to open wide the windows of the Church to the modern world while preserving the deposit of faith intact. Known for his warmth, humility, and pastoral simplicity, he was affectionately called the “Good Pope” by the faithful of Rome. He died in 1963, and Pope Francis canonized him in 2014 together with Pope John Paul II.",
        "source_url": "https://www.vatican.va/content/john-xxiii/en/biography.index.html",
        "source_name": "Vatican.va",
    },
    "Saint John of Avila, Priest and Doctor of the Church": {
        "excerpt": "John of Avila, a Spanish priest known in his lifetime simply as “Master Ávila,” gave up a comfortable inheritance to preach throughout Andalusia, where his fervent sermons and spiritual direction left a lasting mark on the Church in Spain. He guided and encouraged many who would themselves become renowned saints, including Ignatius of Loyola, Teresa of Ávila, and John of God. He died in 1569, was canonized in 1970 by Pope Paul VI, and was declared a Doctor of the Church in 2012 by Pope Benedict XVI.",
        "source_url": "https://www.vatican.va/content/benedict-xvi/en/apost_letters/documents/hf_ben-xvi_apl_20121007_giovanni-avila.html",
        "source_name": "Vatican.va",
    },
    "Saint John of Kanty, Priest": {
        "excerpt": "John of Kanty, a priest and professor at the University of Kraków, lived a life of great austerity and even greater generosity, giving away his own goods and often his own clothing to the poor he met on his travels. Renowned for his learning in theology and philosophy, he was equally renowned for his humility, walking on pilgrimage to Rome and living simply despite his standing among scholars. He died in 1473, and Pope Clement XIII canonized him in 1767; he is honored as patron of Poland and Lithuania and of scholars.",
        "source_url": "https://en.wikipedia.org/wiki/John_of_Kanty",
        "source_name": "Wikipedia",
    },
    "Saint Josaphat, Bishop and Martyr": {
        "excerpt": "Josaphat Kuntsevych, a Ruthenian archbishop of the Byzantine rite, labored with great zeal to bring the Ruthenian Church into full communion with Rome following the Union of Brest, enduring bitter opposition from those who resisted the reunion. His preaching and reforms provoked a mob in Vitebsk, who set upon him and killed him in 1623 for his fidelity to unity with the See of Peter. Pope Pius IX canonized him in 1867, the first saint of the Eastern Churches canonized by formal process in Rome.",
        "source_url": "https://en.wikipedia.org/wiki/Josaphat_Kuntsevych",
        "source_name": "Wikipedia",
    },
    "Saint Joseph the Worker": {
        "excerpt": "Saint Joseph, spouse of the Blessed Virgin Mary and foster father of Our Lord, labored quietly as a carpenter in Nazareth, sanctifying ordinary work by the humility and fidelity with which he carried it out. On this day the Church keeps a second feast in his honor, instituted by Pope Pius XII in 1955 to set before the world’s laborers a model of work joined to faith. Under this title Joseph is honored as patron of workers and of all who labor in hidden faithfulness.",
        "source_url": "https://en.wikipedia.org/wiki/Saint_Joseph",
        "source_name": "Wikipedia",
    },
    "Saint Juan Diego Cuauhtlatoatzin": {
        "excerpt": "Juan Diego Cuauhtlatoatzin, a humble indigenous man of Mexico, was granted apparitions of the Blessed Virgin Mary at Tepeyac in 1531, who asked that a church be built in her honor and left her image imprinted upon his cloak as a sign for the local bishop. That image, still venerated today as Our Lady of Guadalupe, became bound to the conversion of millions across the Americas. Juan Diego spent his remaining years in prayer near the shrine that had risen at Mary’s request. He died in 1548, and Pope John Paul II canonized him in 2002 as the first indigenous saint of the Americas.",
        "source_url": "https://www.vatican.va/news_services/liturgy/saints/ns_lit_doc_20020731_juan-diego_en.html",
        "source_name": "Vatican.va",
    },
    "Saint Lawrence of Brindisi, Priest and Doctor of the Church": {
        "excerpt": "Lawrence of Brindisi, an Italian Capuchin friar gifted with an extraordinary command of languages, served the Church as preacher, diplomat, and even military chaplain, encouraging Christian forces before a decisive battle against Ottoman advance into Hungary. He governed the Capuchin Order as Minister General and undertook difficult diplomatic missions in the service of the Holy See. He died in 1619, was canonized by Pope Leo XIII in 1881, and was declared a Doctor of the Church by Pope John XXIII in 1959.",
        "source_url": "https://catholicsaints.info/general-audience-of-pope-benedict-xvi-23-march-2011-saint-lawrence-of-brindisi/",
        "source_name": "Vatican.va",
    },
    "Saint Maria Goretti, Virgin and Martyr": {
        "excerpt": "Maria Goretti, an Italian farm girl of only eleven years, was attacked by a young man of her acquaintance who sought to violate her purity; she resisted to the last, and was fatally wounded for her refusal to consent to sin. On her deathbed she forgave her attacker, who was later moved to repentance in prison and lived to see her canonized. Pope Pius XII declared her a saint in 1950, with her own mother present in Saint Peter’s Square. She is honored as a martyr for chastity and a model of forgiveness.",
        "source_url": "https://en.wikipedia.org/wiki/Maria_Goretti",
        "source_name": "Wikipedia",
    },
    "Saint Martin de Porres, Religious": {
        "excerpt": "Martin de Porres, the son of a Spanish nobleman and a freed woman of African and indigenous descent, entered the Dominican convent of Lima as a lay brother, since the laws of his time barred him from full religious profession because of his mixed race — a restriction later set aside because of his evident holiness. He devoted himself to the sick and poor of the city without distinction, and founded an orphanage and hospital for children. He died in 1639, and Pope John XXIII canonized him in 1962; he is honored as patron of those who work for racial harmony.",
        "source_url": "https://en.wikipedia.org/wiki/Martin_de_Porres",
        "source_name": "Wikipedia",
    },
    "Saint Maximilian Mary Kolbe, Priest and Martyr": {
        "excerpt": "Maximilian Kolbe, a Polish Franciscan friar devoted to spreading knowledge of Mary Immaculate through preaching and the press, was arrested during the German occupation of Poland and sent to the death camp at Auschwitz. When the guards selected ten prisoners to die by starvation in reprisal for an escape, Kolbe offered himself in place of a stranger, a husband and father, and was put to death in 1941. Pope John Paul II canonized him in 1982 as a martyr of charity, and he is honored as patron of prisoners and of families.",
        "source_url": "https://catholicsaints.info/general-audience-of-pope-benedict-xvi-13-august-2008-saint-edith-stein-and-saint-maximilian-mary-kolbe/",
        "source_name": "Vatican.va",
    },
    "Saint Paul Miki and Companions, Martyrs": {
        "excerpt": "Paul Miki, a young Japanese Jesuit only months from ordination, was arrested with twenty-five companions — priests, religious, and laymen, including children — during a persecution of Christians in Japan, and marched some six hundred miles to Nagasaki to be crucified. From the cross he preached forgiveness of his executioners and encouraged his companions to remain steadfast to the end. Their deaths in 1597 are counted among the first fruits of the Japanese Church’s long trial by persecution. Pope Pius IX canonized them in 1862 as the Martyrs of Nagasaki.",
        "source_url": "https://en.wikipedia.org/wiki/Paul_Miki",
        "source_name": "Wikipedia",
    },
    "Saint Paul VI, Pope": {
        "excerpt": "Giovanni Battista Montini, elected pope in 1963, brought the Second Vatican Council to its conclusion two years later and guided the Church through the difficult work of putting its teachings into practice. He wrote of the dignity of human life and of the development of peoples, and traveled abroad more than any pope before him, seeking to bring the Gospel to a changing world. He died in 1978, and Pope Francis canonized him in 2018.",
        "source_url": "https://www.vatican.va/content/paul-vi/en/biografia.index.html",
        "source_name": "Vatican.va",
    },
    "Saint Peter Canisius, Priest and Doctor of the Church": {
        "excerpt": "Peter Canisius, a Dutch Jesuit of great learning, labored throughout the German-speaking lands during the turmoil of the Reformation, founding colleges and writing a catechism that would instruct generations of the faithful in the substance of their faith. His tireless preaching and teaching helped restore and strengthen Catholic life across a divided Europe. He died in 1597, and Pope Pius XI canonized him and declared him a Doctor of the Church in the same ceremony in 1925.",
        "source_url": "https://catholicsaints.info/general-audience-of-pope-benedict-xvi-9-february-2011-saint-peter-canisius/",
        "source_name": "Vatican.va",
    },
    "Saint Peter Chanel, Priest and Martyr": {
        "excerpt": "Peter Chanel, a French missionary priest of the Marist congregation, went to preach the Gospel on the remote Pacific island of Futuna, where he labored patiently for several years amid a people little acquainted with Christianity. When the son of the local chief sought baptism, the chief, fearing the loss of his authority, had Chanel put to death in 1841. He is honored as the first martyr of Oceania, and Pope Pius XII canonized him in 1954.",
        "source_url": "https://en.wikipedia.org/wiki/Peter_Chanel",
        "source_name": "Wikipedia",
    },
    "Saint Peter Claver, Priest": {
        "excerpt": "Peter Claver, a Spanish Jesuit sent to the port city of Cartagena in South America, devoted forty years to the enslaved Africans brought there in chains, boarding the slave ships himself to bring them food, medicine, and the sacraments. He called himself “the slave of the slaves forever,” baptizing and comforting several hundred thousand souls over his lifetime. He died in 1654, and Pope Leo XIII canonized him in 1888; he is honored as patron of missionary work among the oppressed and of the nation of Colombia.",
        "source_url": "https://en.wikipedia.org/wiki/Peter_Claver",
        "source_name": "Wikipedia",
    },
    "Saint Pius X, Pope": {
        "excerpt": "Giuseppe Sarto, a pope of humble peasant origin, was elected in 1903 and devoted his pontificate to the renewal of Christian life, encouraging frequent and even childhood reception of Holy Communion and undertaking a reform of the Church’s liturgy and canon law. He labored simply and directly for the sanctification of souls, keeping to the end the plain manners of his upbringing. He died in 1914, and Pope Pius XII canonized him in 1954 — the first pope canonized in over two centuries.",
        "source_url": "https://en.wikipedia.org/wiki/Pope_Pius_X",
        "source_name": "Wikipedia",
    },
    "Saint Pius of Pietrelcina, Priest": {
        "excerpt": "Padre Pio, a Capuchin friar of southern Italy, bore for some fifty years the visible wounds of Christ’s Passion in his own body, a mystery he sought to keep hidden even as pilgrims flocked to him for confession and prayer. Spending long hours each day in the confessional, he became known for a rare gift of reading souls and for miracles attributed to his intercession, all of which he referred back humbly to God. He died in 1968, and Pope John Paul II, who had gone to him as a young priest, canonized him in 2002.",
        "source_url": "https://catholicsaints.info/pope-john-paul-ii-homily-at-the-canonization-of-saint-pio-of-pietrelcina-16-june-2002/",
        "source_name": "Vatican.va",
    },
    "Saint Raymond of Penyafort, Priest": {
        "excerpt": "Raymond of Penyafort, a Catalan friar of the Dominican Order and a scholar of canon law, was commissioned by Pope Gregory IX to gather and organize the scattered decrees of the Church into a single, ordered body of law — the Decretals — which would govern the Church for centuries. He later served as Master General of the Dominicans, working also for the conversion of Muslims and Jews in Spain through reasoned preaching rather than force. He died in 1275 at nearly a hundred years of age, and Pope Clement VIII canonized him in 1601; he is honored as patron of canon lawyers.",
        "source_url": "https://en.wikipedia.org/wiki/Raymond_of_Penyafort",
        "source_name": "Wikipedia",
    },
    "Saint Rita of Cascia, Religious": {
        "excerpt": "Rita of Cascia endured for years a difficult marriage, and after her husband’s violent death forgave his killers and sought to reconcile her sons to the same forgiveness before they too died young. Left alone, she entered an Augustinian convent, where she lived a life of deep penance and prayer, and bore for many years a wound on her forehead that she and others understood as a share in Christ’s crown of thorns. She died in 1457, and Pope Leo XIII canonized her in 1900; she is venerated as patroness of difficult marriages and of causes thought impossible.",
        "source_url": "https://en.wikipedia.org/wiki/Rita_of_Cascia",
        "source_name": "Wikipedia",
    },
    "Saint Robert Bellarmine, Bishop and Doctor of the Church": {
        "excerpt": "Robert Bellarmine, an Italian Jesuit and cardinal of vast learning, was among the foremost theologians of his age, defending Catholic doctrine against the claims of the Reformation with clarity and charity. He served the Holy See in delicate matters, including the case of Galileo, where he counseled a measured and careful approach. He died in 1621, and Pope Pius XI canonized him and declared him a Doctor of the Church in 1930.",
        "source_url": "https://en.wikipedia.org/wiki/Robert_Bellarmine",
        "source_name": "Wikipedia",
    },
    "Saint Sharbel Makhluf, Hermit": {
        "excerpt": "Charbel Makhlouf, a Lebanese monk of the Maronite Church, spent the last twenty-three years of his life as a hermit near the monastery of Annaya, devoted almost entirely to prayer, penance, and the celebration of the Divine Liturgy in solitude. After his death in 1898, extraordinary reports of light seen at his tomb and of the incorruption of his body drew pilgrims in great numbers, and miracles have continued to be reported through his intercession. Pope Paul VI canonized him in 1977; he is affectionately known as the Miracle Monk of Lebanon.",
        "source_url": "https://en.wikipedia.org/wiki/Sharbel_Makhluf",
        "source_name": "Wikipedia",
    },
    "Saint Teresa Benedicta of the Cross, Virgin and Martyr": {
        "excerpt": "Edith Stein, a Jewish philosopher of great intellectual gifts, embraced the Catholic faith after long searching and entered the Carmelite order, taking the name Teresa Benedicta of the Cross. When the Nazi persecution of the Jews intensified in occupied Holland, she was arrested together with her sister in reprisal for a bishops’ letter condemning these crimes, and was sent to her death at Auschwitz in 1942. She is honored both as a martyr and as a witness who united in herself the heritage of Israel and the Cross of Christ. Pope John Paul II canonized her in 1998 and named her a patroness of Europe.",
        "source_url": "https://catholicsaints.info/general-audience-of-pope-benedict-xvi-13-august-2008-saint-edith-stein-and-saint-maximilian-mary-kolbe/",
        "source_name": "Vatican.va",
    },
    "Saint Teresa of Calcutta, Virgin": {
        "excerpt": "Mother Teresa, an Albanian religious sister who had taught for years in Calcutta, felt called to leave her convent and go out to serve “the poorest of the poor” dying destitute in the city’s streets. She founded the Missionaries of Charity, which spread to serve the abandoned, the sick, and the dying across the world, becoming for many the very image of Christian charity in the twentieth century. She died in 1997, and Pope Francis canonized her in 2016.",
        "source_url": "https://www.vatican.va/news_services/liturgy/saints/ns_lit_doc_20031019_madre-teresa_en.html",
        "source_name": "Vatican.va",
    },
    "Saint Thérèse of the Child Jesus, Virgin and Doctor of the Church": {
        "excerpt": "Thérèse Martin, a French Carmelite nun who entered the convent of Lisieux at only fifteen, lived a hidden life of ordinary duties borne with extraordinary love, which she came to call her “Little Way” of spiritual childhood — trusting confidence in God amid life’s smallest acts. She wrote of this path in her autobiography, Story of a Soul, before dying of tuberculosis in 1897 at the age of twenty-four. Pope Pius XI canonized her in 1925, and Pope John Paul II declared her a Doctor of the Church in 1997, one of only a few women so honored.",
        "source_url": "https://en.wikipedia.org/wiki/Th%C3%A9r%C3%A8se_of_Lisieux",
        "source_name": "Wikipedia",
    },
    "Saints John de Brébeuf and Isaac Jogues, Priests, and Companions, Martyrs": {
        "excerpt": "Jean de Brébeuf, a French Jesuit missionary, spent some twenty-four years laboring among the Huron people of Canada, learning their language so thoroughly that he composed a catechism and dictionary for their instruction in the faith. Isaac Jogues, another Jesuit missionary, endured captivity and mutilation at the hands of the Mohawk before returning to his mission and finally being martyred among them. Both were killed during the wars between the Huron and Iroquois — Brébeuf in 1649, Jogues in 1646 — together with six other Jesuit missionaries known as the North American Martyrs. Pope Pius XI canonized them as a group in 1930.",
        "source_url": "https://en.wikipedia.org/wiki/Jean_de_Br%C3%A9beuf",
        "source_name": "Wikipedia",
    },
}

def person_queries(name):
    if name in SEARCH_OVERRIDES:
        return list(SEARCH_OVERRIDES[name])
    core = re.sub(r"^Saints?\s+", "", name)
    core = core.split(",")[0]
    core = re.sub(r"\s+and\s+Companions\s*$", "", core, flags=re.I)
    return [core]

def http_get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:
        print(f"    error fetching {url}: {e}")
        return None, None

def find_best_url(name, person_query):
    q = urllib.parse.quote(f"Butler {person_query}")
    status, body = http_get(f"{SEARCH_API}?search={q}&per_page=30")
    if status != 200 or not body:
        return None
    results = json.loads(body)
    modern_tokens = tokens(re.sub(r"^Saints?\s+", "", name))
    best_score, best_url = 0.0, None
    for item in results:
        title = html.unescape(item.get("title", ""))
        if not re.search(r"lives of the saints", title, re.I):
            continue
        tail = re.split(r"lives of the saints\s*[‐-―-]*\s*", title, flags=re.I)[-1]
        tail_tokens = tokens(tail)
        if not tail_tokens:
            continue
        union = modern_tokens | tail_tokens
        score = len(modern_tokens & tail_tokens) / len(union) if union else 0
        if score > best_score:
            best_score, best_url = score, item["url"]
    return best_url if best_score >= 0.2 else None

def extract_bio(html_text):
    m = re.search(r"<blockquote>(.*?)</blockquote>", html_text, re.S)
    if not m:
        return None
    paras = re.findall(r"<p>(.*?)</p>", m.group(1), re.S)
    text = " ".join(paras) if paras else re.sub(r"<[^>]+>", " ", m.group(1))
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = re.sub(r"^\s*A\.D\.\s*[\d–‐-]+\.?\s*", "", text)
    text = re.sub(r"^\s*\[[^\]]+\]\s*", "", text)  # drop leading "[Patriarch of ...]" tags
    text = re.sub(r"\s+", " ", text).strip()
    return text or None

def excerpt(text, max_chars=700):
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars]
    last_period = cut.rfind(". ")
    if last_period > 200:
        return cut[:last_period + 1]
    return cut.rstrip() + "…"

def main():
    import sys
    retry_only = "--retry-misses" in sys.argv

    names = set()
    for year in (2026, 2027):
        with open(f"ordo/calendar-{year}.json") as f:
            for ev in json.load(f).values():
                n = ev["name"]
                if re.match(r"^(Saint|Saints)\b", n):
                    names.add(n)

    results = {}
    if retry_only:
        try:
            with open("ordo/saints.json") as f:
                results = json.load(f)
        except FileNotFoundError:
            pass
        names = names - set(results.keys())
        print(f"Retrying {len(names)} previously-missed names…")

    misses = []
    for i, name in enumerate(sorted(names), 1):
        excerpts, urls = [], []
        if name in DIRECT_URLS:
            status, page = http_get(DIRECT_URLS[name])
            if status == 200 and page:
                bio = extract_bio(page)
                if bio:
                    excerpts.append(excerpt(bio))
                    urls.append(DIRECT_URLS[name])
        queries = [] if excerpts else person_queries(name)
        for pq in queries:
            url = find_best_url(name, pq)
            if url:
                status, page = http_get(url)
                if status == 200 and page:
                    bio = extract_bio(page)
                    if bio:
                        excerpts.append(excerpt(bio))
                        urls.append(url)
            time.sleep(0.15)
        if excerpts:
            results[name] = {"excerpt": " / ".join(excerpts), "source_url": urls[0]}
            print(f"[{i}/{len(names)}] OK   {name}")
        else:
            misses.append(name)
            print(f"[{i}/{len(names)}] MISS {name}  (queries: {queries})")

    for name, bio in SUPPLEMENTAL_BIOS.items():
        results.setdefault(name, bio)

    with open("ordo/saints.json", "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=0)

    print(f"\n{len(results)}/{len(names)} matched, {len(misses)} missing:")
    for m in misses:
        print(" -", m)

if __name__ == "__main__":
    main()
