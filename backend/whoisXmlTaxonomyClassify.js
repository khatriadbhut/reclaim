/**
 * Maps WhoisXML Website Categorization API v3 taxonomy labels → Reclaim rollups.
 * Shared by runtime (fallback / new labels) and scripts/build-whois-rollup-map.mjs.
 */

export function classifyTaxonomyName(rawName) {
  const s = String(rawName || "")
    .toLowerCase()
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();

  if (!s || s === "uncategorized") return null;

  if (
    /\b(business\s+i\.?\s*t\.?|\bi\.t\.|business\s+utilities|technology\s+industry|telecommunications\s+industry|information\s+services\s+industry)\b/.test(s)
  ) {
    return "technology";
  }
  if (/\btechnology\s+and\s+computing\b/.test(s)) return "technology";

  if (
    /\b(artificial intelligence|machine learning|cloud computing|internet of things|information and network security|computer networking|data storage and warehousing|databases|operating systems|programming languages|web development|web design and html|web hosting|email\b|internet\b|browsers|antivirus software|desktops|laptops|tablets and e-readers|smartphones|computer peripherals|wearable technology|robotics|virtual reality|augmented reality|3-d graphics|computer animation|desktop publishing|digital audio|graphics software|photo editing software|video software|shareware and freeware|web conferencing|home entertainment systems|cameras and camcorders)\b/.test(s)
  ) {
    return "technology";
  }
  if (/\b(auto infotainment technologies|auto navigation systems|auto safety technologies)\b/.test(s)) return "technology";

  if (
    /\b(travel\b|tourism|hotel|hotels|motel|flight|air travel|vacation|cruises?|rail travel|road trips?|day trips?|honeymoon|spa\b|bed and breakfasts|hostel|adventure travel|africa travel|asia travel|australia|europe travel|north america travel|south america travel|polar travel|family travel|business travel|beach travel|budget travel|camping\b|skiing\b|travel preparation|travel books)\b/.test(s) ||
    /\b(hospitality industry)\b/.test(s) ||
    /\b(aviation industry)\b/.test(s) ||
    /\b(honeymoons and getaways|spas\b)\b/.test(s)
  ) {
    return "travel";
  }

  if (
    /\b(careers?\b|career advice|career planning|job search|apprenticeships?|vocational training|remote working|human resources|startups\b|executive leadership|management consulting industry)\b/.test(s)
  ) {
    return "jobs";
  }

  if (
    /\b(real estate|apartments|houses\b|property|properties|land and farms|industrial property|office property|retail property|vacation properties|developmental sites|hotel properties|real estate industry)\b/.test(s) ||
    /\b(home and garden|home improvement|interior decorating|landscaping|gardening|home appliances|home security|woodworking|remodeling and construction|home utilities|indoor environmental quality|outdoor decorating|smart home)\b/.test(s)
  ) {
    return "realestate";
  }

  if (/\b(news|journalism|politics|political|international news|national news|local news|weather|crime\b|disasters|law\b|legal services industry)\b/.test(s)) {
    return "news";
  }

  if (
    /\b(finance|financial|banking|investment|insurance|economy|taxes|debt|retirement|lotter(y|ies)|crypto|mortgage|credit|loan|venture capital|accounting|business accounting|business banking|business and finance|consumer banking|financial assistance|financial planning|financial industry|personal finance|personal investing|personal taxes|frugal living|sales\b)\b/.test(s)
  ) {
    return "finance";
  }
  if (/\b(marketing and advertising|advertising industry)\b/.test(s)) return "finance";
  if (
    /\b(business\b|business administration|business operations|consumer issues|green solutions|small and medium-sized business|logistics\b|logistics and transportation industry|economy\b)\b/.test(s)
  ) {
    return "finance";
  }

  if (
    /\b(education industry|education\b|school|university|college|learning|tutorial|homework|homeschool|educational assessment|postgraduate|primary education|secondary|adult education|language learning|educational video games|private school|special education|early childhood|homeschooling|homework and study|science\b|biological sciences|chemistry|physics|genetics|geology|geography|space and astronomy|workshops and classes|environment\b)\b/.test(s)
  ) {
    return "education";
  }
  if (
    /\b(books and literature|children's literature|poetry|fiction|biographies|comics|young adult literature|cookbooks|travel books|art and photography books)\b/.test(s)
  ) {
    return "education";
  }

  if (
    /\b(healthcare industry|medical health|pharmaceutical|men's health|women's health|children's health|senior health|healthy living|nutrition|healthy cooking|medical tests|pharmaceutical drugs|vaccines|dental|mental health|substance abuse|smoking cessation|weight loss|cosmetic medical|veterinary|pet adoptions|alternative medicine|physical therapy|eldercare)\b/.test(s) ||
    /\b(allergies?|disease|disorder|cancer|diabetes|infectious|injuries|sexual health|skin and dermatology|sleep disorders|surgery|blood disorders|bone and joint|brain and nervous|cold and flu|digestive|ear, nose|endocrine|eye and vision|foot health|heart and cardiovascular|lung and respiratory|reproductive health)\b/.test(s)
  ) {
    return "health";
  }
  if (/\b(bath and shower|deodorant|oral care|shaving|beauty\b)\b/.test(s)) return "health";

  if (
    /\b(food industry|food and drink|restaurant|dining|bars and restaurants|cooking\b|desserts|world cuisines|vegan|vegetarian|non-alcoholic|alcoholic beverages|food allergies|food movements|barbecues and grilling)\b/.test(s)
  ) {
    return "food";
  }

  if (/\b(social networking|dating|divorce|marriage|parenting|family and relationships)\b/.test(s)) return "social";

  if (
    /\b(musicals\b|national and civic holidays|outdoor activities|parks and nature|party supplies and decorations|cinemas and events|cigars|genealogy and ancestry|hobbies and interests|home entertaining)\b/.test(s)
  ) {
    return "entertainment";
  }

  if (
    /\b(entertainment industry|video gaming|esports|movies\b|television|music and audio|comedy events|theater|casinos|gambling|nightclubs|museums|theme parks|amusement|awards shows|fan conventions|sporting events|political event|religious events|events and attractions|historic site|national and civic holidays|personal celebrations|bereavement|humor and satire|pop culture|comic books|roleplaying games|board games|puzzles|card games|magic and illusion|sci-fi and fantasy|paranormal|stamps and coins|antiquing|arts and crafts|photography|drawing|painting|needlework|beadwork|candle|birdwatching|beekeeping|woodworking|model toys|musical instruments|radio control|screenwriting|video production|audio production|freelance writing|fine art|modern art|opera|dance\b|design\b|digital arts|costume|fine art photography|animation movies|comedy movies|documentary|drama movies|family and children movies|fantasy movies|horror movies|indie|romance movies|science fiction movies|world movies|crime and mystery)\b/.test(s)
  ) {
    return "entertainment";
  }
  if (
    /\b(children's tv|music tv|sports tv|science fiction tv|drama tv|comedy tv|reality tv|soap opera|special interest tv|factual tv|television\b|talk radio|sports radio|animation tv|holiday tv)\b/.test(s)
  ) {
    return "entertainment";
  }
  if (
    /\b(adult album alternative|classic hits|contemporary hits|songwriters|jazz|oldies|reggae|blues|r and b|soul|funk|gospel music|hip hop|country music|dance and electronic|inspirational|rock music|college radio|soft ac|urban ac)\b/.test(s) ||
    /\b(soundtracks|variety \(music|urban contemporary|world)\b/.test(s)
  ) {
    return "entertainment";
  }
  if (
    /\b(music\b|sports\b|games\b|gaming|video games|console games|mobile games|pc games|action video games|puzzle video games|strategy video games|simulation video games|mmos|educational video games|sports video games|music and party video games|exercise and fitness video games|sensitive topics)\b/.test(s)
  ) {
    return "entertainment";
  }

  if (
    /\b(american football|australian rules football|badminton|baseball|basketball|beach volleyball|bodybuilding|bowling|boxing|cheerleading|cricket|cycling|darts|diving|disabled sports|equine sports|extreme sports|fantasy sports|fishing sports|golf|gymnastics|hunting and shooting|ice hockey|inline skating|lacrosse|martial arts|olympic sports|poker and professional gambling|rodeo|rowing|rugby|running and jogging|sailing|skiing|snooker|soccer|softball|squash|swimming|table tennis|tennis|track and field|volleyball|walking|water polo|weightlifting|wrestling|figure skating|field hockey)\b/.test(s)
  ) {
    return "entertainment";
  }

  if (
    /\b(shopping\b|retail industry|coupons and discounts|flower shopping|grocery shopping|holiday shopping|sales and promotions|malls and shopping centers|household supplies|apparel industry|style and fashion|fashion events|fashion trends|high fashion|designer clothing|street style|children's clothing|men's clothing|women's clothing|men's shoes|women's shoes|men's accessories|women's accessories|body art|gifts and greetings cards)\b/.test(s)
  ) {
    return "shopping";
  }

  if (
    /\b(automotive\b|car culture|motorcycles|scooters|road-side assistance|auto buying|auto insurance|auto parts|auto recalls|auto repair|auto safety|auto shows|auto rentals|auto racing)\b/.test(s) ||
    /\b(automotive industry)\b/.test(s)
  ) {
    return "shopping";
  }

  if (/\b(pets\b|dogs|cats|pet supplies|reptiles|fish and aquariums|birds\b|large animals|zoos)\b/.test(s)) return "other";

  if (
    /\b(manufacturing industry|mechanical and industrial engineering|civil engineering|construction industry|defense industry|metals industry|power and energy industry|agriculture|environmental services industry|non-profit organizations|publishing industry|biotech and biomedical)\b/.test(s)
  ) {
    return "other";
  }
  if (/\b(media industry)\b/.test(s)) return "news";
  if (/\b(pharmaceutical industry)\b/.test(s)) return "health";

  if (/\b(religion and spirituality|religion\b|spirituality\b|christianity|islam|judaism|hinduism|buddhism|sikhism|agnosticism|atheism|astrology)\b/.test(s)) return null;

  return null;
}
