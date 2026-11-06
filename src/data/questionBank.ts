export interface BankQuestion {
  topic: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export const QUESTION_BANK: BankQuestion[] = [
  // ============================================================================
  // 1. Politics & Government (10 Questions: 4 Easy, 4 Medium, 2 Hard)
  // ============================================================================
  {
    topic: 'Politics & Government',
    question: 'How many fundamental rights are currently recognized in the Indian Constitution?',
    option_a: '5',
    option_b: '6',
    option_c: '7',
    option_d: '8',
    correct_option: 'B',
    explanation: 'There are currently 6 fundamental rights recognized in the Indian Constitution after the Right to Property was made a legal right.',
    difficulty: 'easy'
  },
  {
    topic: 'Politics & Government',
    question: 'Who is known as the Chief Architect and Father of the Indian Constitution?',
    option_a: 'Dr. B.R. Ambedkar',
    option_b: 'Jawaharlal Nehru',
    option_c: 'Sardar Vallabhbhai Patel',
    option_d: 'Dr. Rajendra Prasad',
    correct_option: 'A',
    explanation: 'Dr. Bhimrao Ramji Ambedkar served as the chairman of the Drafting Committee of the Indian Constitution.',
    difficulty: 'easy'
  },
  {
    topic: 'Politics & Government',
    question: 'What is the official term length of the President of India in years?',
    option_a: '4 years',
    option_b: '5 years',
    option_c: '6 years',
    option_d: '7 years',
    correct_option: 'B',
    explanation: 'Under Article 56 of the Indian Constitution, the President holds office for a term of 5 years from entering office.',
    difficulty: 'easy'
  },
  {
    topic: 'Politics & Government',
    question: 'What is the minimum age required to become the Prime Minister of India if a member of Lok Sabha?',
    option_a: '21 years',
    option_b: '25 years',
    option_c: '30 years',
    option_d: '35 years',
    correct_option: 'B',
    explanation: 'To become Prime Minister via Lok Sabha membership, an Indian citizen must be at least 25 years old.',
    difficulty: 'easy'
  },
  {
    topic: 'Politics & Government',
    question: 'What is the minimum voting age for citizens in India as enacted by the 61st Amendment Act?',
    option_a: '21 years',
    option_b: '20 years',
    option_c: '18 years',
    option_d: '16 years',
    correct_option: 'C',
    explanation: 'The 61st Constitutional Amendment Act lowered the voting age for elections to the Lok Sabha and Vidhan Sabhas from 21 to 18 years.',
    difficulty: 'medium'
  },
  {
    topic: 'Politics & Government',
    question: 'Which constitutional body is responsible for conducting free and fair elections in India?',
    option_a: 'NITI Aayog',
    option_b: 'Supreme Court of India',
    option_c: 'Election Commission of India',
    option_d: 'Union Public Service Commission',
    correct_option: 'C',
    explanation: 'The Election Commission of India operates under Article 324 of the Constitution to administer elections.',
    difficulty: 'medium'
  },
  {
    topic: 'Politics & Government',
    question: 'How many members of the Rajya Sabha can be nominated by the President of India for expertise in art, literature, or science?',
    option_a: '10',
    option_b: '12',
    option_c: '14',
    option_d: '16',
    correct_option: 'B',
    explanation: 'Under Article 80, the President can nominate 12 members to the Rajya Sabha possessing special knowledge in literature, science, art, and social service.',
    difficulty: 'medium'
  },
  {
    topic: 'Politics & Government',
    question: 'Which schedule of the Indian Constitution contains the anti-defection law provisions?',
    option_a: '8th Schedule',
    option_b: '9th Schedule',
    option_c: '10th Schedule',
    option_d: '12th Schedule',
    correct_option: 'C',
    explanation: 'The 10th Schedule, added by the 52nd Amendment in 1985, outlines the anti-defection provisions for legislators.',
    difficulty: 'medium'
  },
  {
    topic: 'Politics & Government',
    question: 'Under which Article of the Indian Constitution can the President declare a National Emergency?',
    option_a: 'Article 352',
    option_b: 'Article 356',
    option_c: 'Article 360',
    option_d: 'Article 370',
    correct_option: 'A',
    explanation: 'Article 352 empowers the President to proclaim a national emergency on grounds of war, external aggression, or armed rebellion.',
    difficulty: 'hard'
  },
  {
    topic: 'Politics & Government',
    question: 'Which landmark Supreme Court of India case established the Basic Structure Doctrine in 1973?',
    option_a: 'Golaknath case',
    option_b: 'Kesavananda Bharati case',
    option_c: 'Minerva Mills case',
    option_d: 'Maneka Gandhi case',
    correct_option: 'B',
    explanation: 'The Kesavananda Bharati v. State of Kerala ruling in 1973 established that Parliament cannot alter the basic structure of the Constitution.',
    difficulty: 'hard'
  },

  // ============================================================================
  // 2. Pollution & Environment (10 Questions: 4 Easy, 4 Medium, 2 Hard)
  // ============================================================================
  {
    topic: 'Pollution & Environment',
    question: 'Which daily habit is most effective in eliminating single-use plastic waste?',
    option_a: 'Using reusable cloth bags and stainless steel water bottles',
    option_b: 'Burning plastic waste in backyard pits',
    option_c: 'Throwing plastic bottles into regular trash bins',
    option_d: 'Purchasing more bottled beverages',
    correct_option: 'A',
    explanation: 'Carrying reusable bags and bottles prevents the manufacturing and disposal cycle of disposable single-use plastics.',
    difficulty: 'easy'
  },
  {
    topic: 'Pollution & Environment',
    question: 'Which renewable energy source harnesses heat from beneath the Earth surface?',
    option_a: 'Solar Power',
    option_b: 'Geothermal Energy',
    option_c: 'Biomass Energy',
    option_d: 'Hydroelectric Power',
    correct_option: 'B',
    explanation: 'Geothermal energy is thermal energy generated and stored in the Earth crust.',
    difficulty: 'easy'
  },
  {
    topic: 'Pollution & Environment',
    question: 'What is the color of the standard recycling bin for wet organic and biodegradable kitchen waste in India?',
    option_a: 'Green',
    option_b: 'Blue',
    option_c: 'Red',
    option_d: 'Black',
    correct_option: 'A',
    explanation: 'Green bins are designated for wet biodegradable waste, while blue bins are for dry recyclables.',
    difficulty: 'easy'
  },
  {
    topic: 'Pollution & Environment',
    question: 'Which tree is widely recognized for producing oxygen around the clock through Crassulacean Acid Metabolism?',
    option_a: 'Peepal tree (Ficus religiosa)',
    option_b: 'Pine tree',
    option_c: 'Eucalyptus tree',
    option_d: 'Oak tree',
    correct_option: 'A',
    explanation: 'The Peepal tree performs CAM photosynthesis, releasing oxygen even during nocturnal hours.',
    difficulty: 'easy'
  },
  {
    topic: 'Pollution & Environment',
    question: 'What is the primary gas contributing to the greenhouse effect on Earth?',
    option_a: 'Argon',
    option_b: 'Carbon Dioxide',
    option_c: 'Oxygen',
    option_d: 'Helium',
    correct_option: 'B',
    explanation: 'Carbon dioxide is the most prevalent anthropogenic greenhouse gas driving global climate warming.',
    difficulty: 'medium'
  },
  {
    topic: 'Pollution & Environment',
    question: 'What does AQI stand for in environmental monitoring?',
    option_a: 'Atmospheric Quality Index',
    option_b: 'Air Quality Indicator',
    option_c: 'Air Quality Index',
    option_d: 'Aerosol Quantity Index',
    correct_option: 'C',
    explanation: 'AQI stands for Air Quality Index, used by government agencies to communicate how polluted the air currently is.',
    difficulty: 'medium'
  },
  {
    topic: 'Pollution & Environment',
    question: 'What size category defines fine particulate matter that easily penetrates deep into human lungs?',
    option_a: 'PM 50',
    option_b: 'PM 2.5',
    option_c: 'PM 100',
    option_d: 'PM 500',
    correct_option: 'B',
    explanation: 'PM 2.5 refers to atmospheric particulate matter with a diameter less than 2.5 micrometers.',
    difficulty: 'medium'
  },
  {
    topic: 'Pollution & Environment',
    question: 'Which Indian wetland system in Kerala was recognized as a Ramsar site for its unique below-sea-level farming system?',
    option_a: 'Vembanad-Kol Wetland',
    option_b: 'Chilika Lake',
    option_c: 'Wular Lake',
    option_d: 'Sambhar Lake',
    correct_option: 'A',
    explanation: 'The Vembanad-Kol Wetland in Kerala is a Ramsar site encompassing the Kuttanad below-sea-level farming system.',
    difficulty: 'medium'
  },
  {
    topic: 'Pollution & Environment',
    question: 'Which international treaty signed in 1987 successfully phased out ozone-depleting substances?',
    option_a: 'Paris Agreement',
    option_b: 'Kyoto Protocol',
    option_c: 'Montreal Protocol',
    option_d: 'Basel Convention',
    correct_option: 'C',
    explanation: 'The Montreal Protocol is an international treaty designed to protect the ozone layer by phasing out CFCs and related halocarbons.',
    difficulty: 'hard'
  },
  {
    topic: 'Pollution & Environment',
    question: 'Which phenomenon causes excessive algae blooms that deplete aquatic dissolved oxygen in lakes due to fertilizer runoff?',
    option_a: 'Bioaccumulation',
    option_b: 'Eutrophication',
    option_c: 'Biomagnification',
    option_d: 'Salinization',
    correct_option: 'B',
    explanation: 'Eutrophication occurs when water bodies become overly enriched with minerals and nutrients, inducing excessive growth of algae and hypoxia.',
    difficulty: 'hard'
  },

  // ============================================================================
  // 3. AI & Technology (10 Questions: 4 Easy, 4 Medium, 2 Hard)
  // ============================================================================
  {
    topic: 'AI & Technology',
    question: 'What does the acronym AI stand for in computer science?',
    option_a: 'Automated Intelligence',
    option_b: 'Artificial Intelligence',
    option_c: 'Applied Integration',
    option_d: 'Advanced Information',
    correct_option: 'B',
    explanation: 'AI stands for Artificial Intelligence, the field of creating intelligent computer agents.',
    difficulty: 'easy'
  },
  {
    topic: 'AI & Technology',
    question: 'Which organization created the popular ChatGPT conversational model in November 2022?',
    option_a: 'Google DeepMind',
    option_b: 'OpenAI',
    option_c: 'Meta AI',
    option_d: 'Apple',
    correct_option: 'B',
    explanation: 'OpenAI developed and released ChatGPT based on its Generative Pre-trained Transformer architecture.',
    difficulty: 'easy'
  },
  {
    topic: 'AI & Technology',
    question: 'Which programming language is currently the most widely used for training deep learning models?',
    option_a: 'Python',
    option_b: 'Ruby',
    option_c: 'PHP',
    option_d: 'Pascal',
    correct_option: 'A',
    explanation: 'Python dominates machine learning and AI development due to frameworks like PyTorch, TensorFlow, and scikit-learn.',
    difficulty: 'easy'
  },
  {
    topic: 'AI & Technology',
    question: 'What does CPU stand for in computer hardware?',
    option_a: 'Central Processing Unit',
    option_b: 'Computer Performance Utility',
    option_c: 'Core Program Unit',
    option_d: 'Central Performance User',
    correct_option: 'A',
    explanation: 'CPU stands for Central Processing Unit, the primary electronic circuitry executing computer instructions.',
    difficulty: 'easy'
  },
  {
    topic: 'AI & Technology',
    question: 'What does the "T" represent in the transformer architecture acronym GPT?',
    option_a: 'Translation',
    option_b: 'Transformer',
    option_c: 'Terminal',
    option_d: 'Tokenizer',
    correct_option: 'B',
    explanation: 'GPT stands for Generative Pre-trained Transformer, introduced in Google Research landmark 2017 paper.',
    difficulty: 'medium'
  },
  {
    topic: 'AI & Technology',
    question: 'What is the name of Google multimodal foundation model family powering Gemini apps?',
    option_a: 'Gemini',
    option_b: 'Llama',
    option_c: 'Claude',
    option_d: 'Mistral',
    correct_option: 'A',
    explanation: 'Gemini is Google multimodal AI model family designed to reason seamlessly across text, images, video, audio, and code.',
    difficulty: 'medium'
  },
  {
    topic: 'AI & Technology',
    question: 'What is the term for when an AI language model generates convincing yet factually incorrect outputs?',
    option_a: 'Overclocking',
    option_b: 'Hallucination',
    option_c: 'Quantization',
    option_d: 'Deadlock',
    correct_option: 'B',
    explanation: 'In LLMs, hallucination refers to generating responses that appear coherent but are untruthful or unsupported by facts.',
    difficulty: 'medium'
  },
  {
    topic: 'AI & Technology',
    question: 'Which neural network architecture is traditionally best suited for sequential data like speech and time-series analysis?',
    option_a: 'Recurrent Neural Network (RNN)',
    option_b: 'Convolutional Neural Network (CNN)',
    option_c: 'Generative Adversarial Network (GAN)',
    option_d: 'Multi-layer Perceptron (MLP)',
    correct_option: 'A',
    explanation: 'RNNs and LSTMs process inputs sequentially by maintaining an internal state memory over time.',
    difficulty: 'medium'
  },
  {
    topic: 'AI & Technology',
    question: 'Which seminal research paper by Google researchers in 2017 first introduced the self-attention Transformer architecture?',
    option_a: 'Attention Is All You Need',
    option_b: 'Deep Residual Learning for Image Recognition',
    option_c: 'Generative Adversarial Nets',
    option_d: 'Mastering the Game of Go',
    correct_option: 'A',
    explanation: '"Attention Is All You Need" by Vaswani et al. (2017) revolutionized natural language processing by introducing the Transformer.',
    difficulty: 'hard'
  },
  {
    topic: 'AI & Technology',
    question: 'In deep learning optimization, what does the technique LoRA stand for in fine-tuning massive language models?',
    option_a: 'Low-Rank Adaptation',
    option_b: 'Linear Output Regularized Alignment',
    option_c: 'Local Residual Accumulation',
    option_d: 'Logarithmic Rate Acceleration',
    correct_option: 'A',
    explanation: 'LoRA stands for Low-Rank Adaptation, freezing pretrained weights and injecting trainable rank decomposition matrices.',
    difficulty: 'hard'
  },

  // ============================================================================
  // 4. Social Media (10 Questions: 4 Easy, 4 Medium, 2 Hard)
  // ============================================================================
  {
    topic: 'Social Media',
    question: 'Which parent company owns Instagram, WhatsApp, and Facebook?',
    option_a: 'Alphabet',
    option_b: 'Meta Platforms',
    option_c: 'Microsoft',
    option_d: 'Amazon',
    correct_option: 'B',
    explanation: 'Meta Platforms (formerly Facebook, Inc.) owns Facebook, Instagram, WhatsApp, and Messenger.',
    difficulty: 'easy'
  },
  {
    topic: 'Social Media',
    question: 'What is the maximum duration in hours for regular Instagram and WhatsApp Stories before they vanish?',
    option_a: '12 hours',
    option_b: '24 hours',
    option_c: '48 hours',
    option_d: '72 hours',
    correct_option: 'B',
    explanation: 'Stories on Instagram, WhatsApp, and Facebook disappear automatically after 24 hours.',
    difficulty: 'easy'
  },
  {
    topic: 'Social Media',
    question: 'Which platform is best known for short-form video reels that popularized viral dance challenges?',
    option_a: 'TikTok',
    option_b: 'LinkedIn',
    option_c: 'Pinterest',
    option_d: 'Tumblr',
    correct_option: 'A',
    explanation: 'TikTok revolutionized social media with its algorithmically driven short-form vertical video feed.',
    difficulty: 'easy'
  },
  {
    topic: 'Social Media',
    question: 'What symbol is universally used on Twitter/X, Instagram, and LinkedIn to tag and discover topical posts?',
    option_a: '# (Hashtag)',
    option_b: '@ (At symbol)',
    option_c: '$ (Dollar symbol)',
    option_d: '& (Ampersand)',
    correct_option: 'A',
    explanation: 'Hashtags (#) are used across platforms to group and search posts by topic.',
    difficulty: 'easy'
  },
  {
    topic: 'Social Media',
    question: 'In what year was YouTube created before being acquired by Google in 2006?',
    option_a: '2003',
    option_b: '2005',
    option_c: '2008',
    option_d: '2010',
    correct_option: 'B',
    explanation: 'YouTube was created in February 2005 by Chad Hurley, Steve Chen, and Jawed Karim, and purchased by Google in November 2006.',
    difficulty: 'medium'
  },
  {
    topic: 'Social Media',
    question: 'What is the text-based social app launched by Instagram in July 2023 to compete with X (Twitter)?',
    option_a: 'Bluesky',
    option_b: 'Threads',
    option_c: 'Mastodon',
    option_d: 'Clubhouse',
    correct_option: 'B',
    explanation: 'Meta launched Threads in July 2023, integrating directly with users Instagram accounts.',
    difficulty: 'medium'
  },
  {
    topic: 'Social Media',
    question: 'Which encryption protocol does WhatsApp use to ensure end-to-end encrypted messaging?',
    option_a: 'Signal Protocol',
    option_b: 'RSA-1024',
    option_c: 'DES-56',
    option_d: 'MD5 Hashing',
    correct_option: 'A',
    explanation: 'WhatsApp implements the Signal Protocol developed by Open Whisper Systems for end-to-end messaging encryption.',
    difficulty: 'medium'
  },
  {
    topic: 'Social Media',
    question: 'What is the character limit for free users on X (formerly Twitter) for a standard tweet?',
    option_a: '140 characters',
    option_b: '280 characters',
    option_c: '500 characters',
    option_d: '1000 characters',
    correct_option: 'B',
    explanation: 'Twitter doubled its historic 140-character limit to 280 characters in November 2017.',
    difficulty: 'medium'
  },
  {
    topic: 'Social Media',
    question: 'Who co-founded the professional networking platform LinkedIn in 2002 before its acquisition by Microsoft?',
    option_a: 'Reid Hoffman',
    option_b: 'Jack Dorsey',
    option_c: 'Jan Koum',
    option_d: 'Marc Andreessen',
    correct_option: 'A',
    explanation: 'Reid Hoffman and founding team members launched LinkedIn in 2002; Microsoft acquired LinkedIn in 2016.',
    difficulty: 'hard'
  },
  {
    topic: 'Social Media',
    question: 'Which open social network standard allows decentralized networks like Mastodon to interoperate in the "Fediverse"?',
    option_a: 'ActivityPub',
    option_b: 'WebRTC',
    option_c: 'OAuth 2.0',
    option_d: 'SOAP',
    correct_option: 'A',
    explanation: 'ActivityPub is a decentralized social networking protocol endorsed by the W3C that powers the Fediverse.',
    difficulty: 'hard'
  },

  // ============================================================================
  // 5. Kerala & Current Affairs (10 Questions: 4 Easy, 4 Medium, 2 Hard)
  // ============================================================================
  {
    topic: 'Kerala & Current Affairs',
    question: 'What is the official state animal of Kerala?',
    option_a: 'Indian Elephant',
    option_b: 'Bengal Tiger',
    option_c: 'Nilgiri Tahr',
    option_d: 'Spotted Deer',
    correct_option: 'A',
    explanation: 'The Indian Elephant (Elephas maximus indicus) is the state animal of Kerala.',
    difficulty: 'easy'
  },
  {
    topic: 'Kerala & Current Affairs',
    question: 'What is the official state bird of Kerala known for its distinct curved bill?',
    option_a: 'Great Indian Hornbill',
    option_b: 'Peacock',
    option_c: 'House Sparrow',
    option_d: 'Kingfisher',
    correct_option: 'A',
    explanation: 'The Great Indian Hornbill is the official state bird of Kerala.',
    difficulty: 'easy'
  },
  {
    topic: 'Kerala & Current Affairs',
    question: 'Which annual cultural festival celebrated across Kerala commemorates the legendary King Mahabali?',
    option_a: 'Onam',
    option_b: 'Vishu',
    option_c: 'Thrissur Pooram',
    option_d: 'Attukal Pongala',
    correct_option: 'A',
    explanation: 'Onam is the harvest festival of Kerala celebrating the annual visit of benevolent King Mahabali.',
    difficulty: 'easy'
  },
  {
    topic: 'Kerala & Current Affairs',
    question: 'How many revenue districts are there in the state of Kerala?',
    option_a: '12',
    option_b: '14',
    option_c: '16',
    option_d: '18',
    correct_option: 'B',
    explanation: 'Kerala has 14 revenue districts, from Kasaragod in the north to Thiruvananthapuram in the south.',
    difficulty: 'easy'
  },
  {
    topic: 'Kerala & Current Affairs',
    question: 'Which is the longest river flowing entirely within the state of Kerala?',
    option_a: 'Bharathappuzha',
    option_b: 'Periyar',
    option_c: 'Pamba',
    option_d: 'Chaliyar',
    correct_option: 'B',
    explanation: 'The Periyar River is the longest river in Kerala with a length of approximately 244 kilometers.',
    difficulty: 'medium'
  },
  {
    topic: 'Kerala & Current Affairs',
    question: 'Which airport in Kerala became the world first airport fully powered by solar energy in 2015?',
    option_a: 'Cochin International Airport (CIAL)',
    option_b: 'Trivandrum International Airport',
    option_c: 'Calicut International Airport',
    option_d: 'Kannur International Airport',
    correct_option: 'A',
    explanation: 'Cochin International Airport (CIAL) became the world first 100% solar-powered airport in 2015, winning the UN Champions of the Earth award.',
    difficulty: 'medium'
  },
  {
    topic: 'Kerala & Current Affairs',
    question: 'Which traditional classical dance drama from Kerala is internationally famed for its elaborate face makeup and colorful costumes?',
    option_a: 'Mohiniyattam',
    option_b: 'Kathakali',
    option_c: 'Theyyam',
    option_d: 'Koodiyattam',
    correct_option: 'B',
    explanation: 'Kathakali is the iconic classical art form of Kerala recognized for its elaborate facial makeup, gestures, and elaborate headdresses.',
    difficulty: 'medium'
  },
  {
    topic: 'Kerala & Current Affairs',
    question: 'What is the highest mountain peak in Kerala and South India, situated in the Western Ghats?',
    option_a: 'Agasthyarkoodam',
    option_b: 'Anamudi',
    option_c: 'Chembra Peak',
    option_d: 'Banasura Hill',
    correct_option: 'B',
    explanation: 'Anamudi stands at 2,695 meters (8,842 ft) in Eravikulam National Park and is the highest peak in South India.',
    difficulty: 'medium'
  },
  {
    topic: 'Kerala & Current Affairs',
    question: 'In which year did the historic Temple Entry Proclamation get issued by Chithira Thirunal Balarama Varma in Travancore?',
    option_a: '1924',
    option_b: '1931',
    option_c: '1936',
    option_d: '1947',
    correct_option: 'C',
    explanation: 'The Temple Entry Proclamation was issued on November 12, 1936, opening public temples in Travancore to all Hindus.',
    difficulty: 'hard'
  },
  {
    topic: 'Kerala & Current Affairs',
    question: 'Which ancient port city in Kerala was the hub of the spice trade connecting India with the Roman and Mediterranean world?',
    option_a: 'Muziris',
    option_b: 'Beypore',
    option_c: 'Alappuzha',
    option_d: 'Kollam',
    correct_option: 'A',
    explanation: 'Muziris (near present-day Kodungallur) was the legendary ancient port described by Pliny the Elder as the spice emporium of India.',
    difficulty: 'hard'
  },

  // ============================================================================
  // 6. Cricket & Sports (10 Questions: 4 Easy, 4 Medium, 2 Hard)
  // ============================================================================
  {
    topic: 'Cricket & Sports',
    question: 'How many players are on the field for one cricket team during play?',
    option_a: '9',
    option_b: '10',
    option_c: '11',
    option_d: '12',
    correct_option: 'C',
    explanation: 'Each cricket team fields 11 players during a match.',
    difficulty: 'easy'
  },
  {
    topic: 'Cricket & Sports',
    question: 'Who is fondly known as the "God of Cricket" and the Master Blaster in India?',
    option_a: 'Sachin Tendulkar',
    option_b: 'Virat Kohli',
    option_c: 'Kapil Dev',
    option_d: 'MS Dhoni',
    correct_option: 'A',
    explanation: 'Sachin Tendulkar is revered as the Master Blaster and holds the record for 100 international centuries.',
    difficulty: 'easy'
  },
  {
    topic: 'Cricket & Sports',
    question: 'Which country won the inaugural ICC Men T20 World Cup in 2007 held in South Africa?',
    option_a: 'Pakistan',
    option_b: 'India',
    option_c: 'Australia',
    option_d: 'England',
    correct_option: 'B',
    explanation: 'India won the inaugural 2007 T20 World Cup under the captaincy of MS Dhoni by defeating Pakistan in the final.',
    difficulty: 'easy'
  },
  {
    topic: 'Cricket & Sports',
    question: 'How many overs does each team bat in a standard One Day International (ODI) match?',
    option_a: '20 overs',
    option_b: '40 overs',
    option_c: '50 overs',
    option_d: '60 overs',
    correct_option: 'C',
    explanation: 'ODIs are 50-overs-per-side limited-overs cricket matches.',
    difficulty: 'easy'
  },
  {
    topic: 'Cricket & Sports',
    question: 'Who scored the historic first double century in Men One Day International (ODI) cricket in 2010?',
    option_a: 'Rohit Sharma',
    option_b: 'Sachin Tendulkar',
    option_c: 'Virender Sehwag',
    option_d: 'Chris Gayle',
    correct_option: 'B',
    explanation: 'Sachin Tendulkar made 200 not out against South Africa in Gwalior on February 24, 2010.',
    difficulty: 'medium'
  },
  {
    topic: 'Cricket & Sports',
    question: 'Which Indian javelin thrower won back-to-back Olympic medals: Gold in Tokyo 2020 and Silver in Paris 2024?',
    option_a: 'Neeraj Chopra',
    option_b: 'Abhinav Bindra',
    option_c: 'Sushil Kumar',
    option_d: 'Bajrang Punia',
    correct_option: 'A',
    explanation: 'Neeraj Chopra won Gold at Tokyo 2020 and Silver at Paris 2024 in men javelin throw.',
    difficulty: 'medium'
  },
  {
    topic: 'Cricket & Sports',
    question: 'What is the standard distance between the two sets of wickets on a cricket pitch in yards?',
    option_a: '20 yards',
    option_b: '22 yards',
    option_c: '24 yards',
    option_d: '26 yards',
    correct_option: 'B',
    explanation: 'The cricket pitch is standardly 22 yards (66 feet / 20.12 meters) between the stumps.',
    difficulty: 'medium'
  },
  {
    topic: 'Cricket & Sports',
    question: 'Who holds the record for the highest individual score in a Men ODI innings with 264 runs?',
    option_a: 'Martin Guptill',
    option_b: 'Rohit Sharma',
    option_c: 'Chris Gayle',
    option_d: 'Virender Sehwag',
    correct_option: 'B',
    explanation: 'Rohit Sharma scored 264 off 173 balls against Sri Lanka at Eden Gardens Kolkata in 2014.',
    difficulty: 'medium'
  },
  {
    topic: 'Cricket & Sports',
    question: 'Which bowler took all 10 wickets in a single Test innings for India against Pakistan at Feroz Shah Kotla in 1999?',
    option_a: 'Kapil Dev',
    option_b: 'Anil Kumble',
    option_c: 'Harbhajan Singh',
    option_d: 'Ravichandran Ashwin',
    correct_option: 'B',
    explanation: 'Anil Kumble took 10 for 74 in 1999, becoming only the second bowler in Test cricket history after Jim Laker to take all ten wickets.',
    difficulty: 'hard'
  },
  {
    topic: 'Cricket & Sports',
    question: 'Which legendary Indian hockey player led India to three consecutive Olympic gold medals (1928, 1932, 1936)?',
    option_a: 'Major Dhyan Chand',
    option_b: 'Balbir Singh Sr.',
    option_c: 'K.D. Singh Babu',
    option_d: 'Dhanraj Pillay',
    correct_option: 'A',
    explanation: 'Major Dhyan Chand, celebrated as The Wizard of hockey, was the scoring star of India gold-winning teams in 1928, 1932, and 1936.',
    difficulty: 'hard'
  },

  // ============================================================================
  // 7. Movies & Entertainment (10 Questions: 4 Easy, 4 Medium, 2 Hard)
  // ============================================================================
  {
    topic: 'Movies & Entertainment',
    question: 'Which legendary actor is universally known as "The Complete Actor" in Malayalam cinema?',
    option_a: 'Mohanlal',
    option_b: 'Mammootty',
    option_c: 'Suresh Gopi',
    option_d: 'Jayaram',
    correct_option: 'A',
    explanation: 'Mohanlal is affectionately called "The Complete Actor" by fans and media for his versatile performances.',
    difficulty: 'easy'
  },
  {
    topic: 'Movies & Entertainment',
    question: 'Who played the iconic viral gangster role of "Ranga" in the 2024 blockbuster Malayalam movie "Aavesham"?',
    option_a: 'Fahadh Faasil',
    option_b: 'Tovino Thomas',
    option_c: 'Prithviraj Sukumaran',
    option_d: 'Dulquer Salmaan',
    correct_option: 'A',
    explanation: 'Fahadh Faasil delivered a sensational and viral performance as Ranga in the 2024 smash hit Aavesham.',
    difficulty: 'easy'
  },
  {
    topic: 'Movies & Entertainment',
    question: 'Which 2024 survival thriller became the highest-grossing Malayalam film in history?',
    option_a: 'Premalu',
    option_b: 'Manjummel Boys',
    option_c: 'Bramayugam',
    option_d: 'Aadujeevitham',
    correct_option: 'B',
    explanation: 'Manjummel Boys, directed by Chidambaram, grossed over ₹240 crore worldwide to become the all-time highest-grossing Malayalam film.',
    difficulty: 'easy'
  },
  {
    topic: 'Movies & Entertainment',
    question: 'Which actor is celebrated as "Megastar" across Indian and Malayalam cinema with three National Film Awards for Best Actor?',
    option_a: 'Mammootty',
    option_b: 'Kamal Haasan',
    option_c: 'Rajinikanth',
    option_d: 'Dileep',
    correct_option: 'A',
    explanation: 'Mammootty is celebrated as the Megastar with five decades of acclaimed films and 3 National Awards for Best Actor.',
    difficulty: 'easy'
  },
  {
    topic: 'Movies & Entertainment',
    question: 'Which Indian music composer won two Academy Awards (Oscars) for "Slumdog Millionaire" in 2009?',
    option_a: 'Ilaiyaraaja',
    option_b: 'A.R. Rahman',
    option_c: 'M.M. Keeravani',
    option_d: 'Harris Jayaraj',
    correct_option: 'B',
    explanation: 'A.R. Rahman won Best Original Score and Best Original Song (Jai Ho) at the 81st Academy Awards.',
    difficulty: 'medium'
  },
  {
    topic: 'Movies & Entertainment',
    question: 'Which energetic dance track from S.S. Rajamouli movie "RRR" won the Academy Award for Best Original Song in 2023?',
    option_a: 'Naatu Naatu',
    option_b: 'Dosti',
    option_c: 'Jai Ho',
    option_d: 'Vathi Coming',
    correct_option: 'A',
    explanation: '"Naatu Naatu", composed by M.M. Keeravani with lyrics by Chandrabose, made history as the first song from an Indian film production to win an Oscar.',
    difficulty: 'medium'
  },
  {
    topic: 'Movies & Entertainment',
    question: 'Which Malayalam film directed by Lijo Jose Pellissery was selected as India official entry for the 93rd Academy Awards?',
    option_a: 'Jallikattu',
    option_b: 'Angamaly Diaries',
    option_c: 'Churuli',
    option_d: 'Amen',
    correct_option: 'A',
    explanation: 'Jallikattu was chosen as India official Oscar submission for Best International Feature Film in 2020.',
    difficulty: 'medium'
  },
  {
    topic: 'Movies & Entertainment',
    question: 'Who directed the internationally acclaimed survival epic "Aadujeevitham (The Goat Life)" released in 2024?',
    option_a: 'Blessy',
    option_b: 'Amal Neerad',
    option_c: 'Jeethu Joseph',
    option_d: 'Dileesh Pothan',
    correct_option: 'A',
    explanation: 'Director Blessy spent over 16 years bringing Benyamin novel Aadujeevitham to the screen starring Prithviraj Sukumaran.',
    difficulty: 'medium'
  },
  {
    topic: 'Movies & Entertainment',
    question: 'Which was the first silent feature film made in India, produced and directed by Dadasaheb Phalke in 1913?',
    option_a: 'Raja Harishchandra',
    option_b: 'Alam Ara',
    option_c: 'Kisan Kanya',
    option_d: 'Vigathakumaran',
    correct_option: 'A',
    explanation: 'Raja Harishchandra (1913) is recognized as the first full-length Indian feature film.',
    difficulty: 'hard'
  },
  {
    topic: 'Movies & Entertainment',
    question: 'Who was the pioneering director of "Vigathakumaran" (1928), the very first silent film produced in Malayalam cinema?',
    option_a: 'J.C. Daniel',
    option_b: 'P. Ramu Kariat',
    option_c: 'Adoor Gopalakrishnan',
    option_d: 'P. Padmarajan',
    correct_option: 'A',
    explanation: 'J.C. Daniel is commemorated as the Father of Malayalam Cinema for producing, directing, and acting in Vigathakumaran (1928).',
    difficulty: 'hard'
  },

  // ============================================================================
  // 8. College & Office Life (10 Questions: 4 Easy, 4 Medium, 2 Hard)
  // ============================================================================
  {
    topic: 'College & Office Life',
    question: 'What does the popular workplace acronym "WFH" stand for?',
    option_a: 'Work From Home',
    option_b: 'Waiting For Help',
    option_c: 'Working Four Hours',
    option_d: 'Weekly Formal Hours',
    correct_option: 'A',
    explanation: 'WFH stands for Work From Home, referring to remote work outside the physical office.',
    difficulty: 'easy'
  },
  {
    topic: 'College & Office Life',
    question: 'What day of the week is most universally celebrated in offices for casual attire and social vibe?',
    option_a: 'Monday',
    option_b: 'Wednesday',
    option_c: 'Friday',
    option_d: 'Tuesday',
    correct_option: 'C',
    explanation: 'Friday is celebrated worldwide as casual Friday and marks the start of the weekend.',
    difficulty: 'easy'
  },
  {
    topic: 'College & Office Life',
    question: 'What does the corporate acronym "FYI" stand for in workplace emails?',
    option_a: 'For Your Information',
    option_b: 'Follow Your Instructions',
    option_c: 'Formal Yearly Interview',
    option_d: 'Fast Yield Indicator',
    correct_option: 'A',
    explanation: 'FYI is standard corporate shorthand for "For Your Information".',
    difficulty: 'easy'
  },
  {
    topic: 'College & Office Life',
    question: 'What is the term for a short daily team meeting where members share yesterday progress and today goals while standing?',
    option_a: 'Stand-up meeting',
    option_b: 'Townhall',
    option_c: 'All-hands summit',
    option_d: 'Board assembly',
    correct_option: 'A',
    explanation: 'Daily stand-ups are agile sync meetings kept deliberately short by having attendees stand.',
    difficulty: 'easy'
  },
  {
    topic: 'College & Office Life',
    question: 'What does "EOD" typically mean when a manager requests a project deliverable?',
    option_a: 'End Of Day',
    option_b: 'Every Other Day',
    option_c: 'Estimate On Demand',
    option_d: 'Early Operations Delivery',
    correct_option: 'A',
    explanation: 'EOD stands for End Of Day, designating close of standard business hours.',
    difficulty: 'medium'
  },
  {
    topic: 'College & Office Life',
    question: 'What is the corporate phrase for employees performing solely the duties strictly outlined in their job contract without unpaid overtime?',
    option_a: 'Quiet quitting',
    option_b: 'Moonlighting',
    option_c: 'Hot desking',
    option_d: 'Bench marketing',
    correct_option: 'A',
    explanation: '"Quiet quitting" describes setting boundaries to not work beyond formal contractual duties.',
    difficulty: 'medium'
  },
  {
    topic: 'College & Office Life',
    question: 'What term describes an informal workplace policy where workstations are shared rather than assigned permanently to individuals?',
    option_a: 'Hot-desking',
    option_b: 'Watercooler chat',
    option_c: 'Outsourcing',
    option_d: 'Job shadowing',
    correct_option: 'A',
    explanation: 'Hot-desking allows workers to choose unassigned desks on a first-come or reservation basis.',
    difficulty: 'medium'
  },
  {
    topic: 'College & Office Life',
    question: 'In engineering and business college campuses, what does the abbreviation "CGPA" stand for?',
    option_a: 'Cumulative Grade Point Average',
    option_b: 'Centralized Graduation Performance Assessment',
    option_c: 'Core Grading Point Algorithm',
    option_d: 'Course General Proficiency Analysis',
    correct_option: 'A',
    explanation: 'CGPA stands for Cumulative Grade Point Average, measuring student academic achievement across semesters.',
    difficulty: 'medium'
  },
  {
    topic: 'College & Office Life',
    question: 'Which managerial management principle asserts that "work expands to fill the time available for its completion"?',
    option_a: 'Peter Principle',
    option_b: 'Parkinson Law',
    option_c: 'Murphy Law',
    option_d: 'Pareto Principle',
    correct_option: 'B',
    explanation: 'Parkinson Law, formulated by Cyril Northcote Parkinson in 1955, states that work expands to fill the time allocated for it.',
    difficulty: 'hard'
  },
  {
    topic: 'College & Office Life',
    question: 'What organizational phenomenon claims that in a hierarchy, every employee tends to rise to their level of incompetence?',
    option_a: 'The Peter Principle',
    option_b: 'Dunbar Number',
    option_c: 'Hawthorne Effect',
    option_d: 'Goodhart Law',
    correct_option: 'A',
    explanation: 'The Peter Principle, observed by Laurence J. Peter, posits that people are promoted based on success in current jobs until reaching a job they cannot do well.',
    difficulty: 'hard'
  },

  // ============================================================================
  // 9. Money & Lifestyle (10 Questions: 4 Easy, 4 Medium, 2 Hard)
  // ============================================================================
  {
    topic: 'Money & Lifestyle',
    question: 'What does UPI stand for in India digital payment ecosystem?',
    option_a: 'Unified Payments Interface',
    option_b: 'Universal Payment Identifier',
    option_c: 'United Pay Internet',
    option_d: 'User Paid Immediate',
    correct_option: 'A',
    explanation: 'UPI stands for Unified Payments Interface, created by the National Payments Corporation of India (NPCI).',
    difficulty: 'easy'
  },
  {
    topic: 'Money & Lifestyle',
    question: 'Which entity acts as the central banking and monetary authority of India?',
    option_a: 'State Bank of India',
    option_b: 'Reserve Bank of India (RBI)',
    option_c: 'Ministry of Commerce',
    option_d: 'Securities and Exchange Board of India',
    correct_option: 'B',
    explanation: 'The Reserve Bank of India (RBI) manages the currency, money supply, and monetary policies of India.',
    difficulty: 'easy'
  },
  {
    topic: 'Money & Lifestyle',
    question: 'What is the term for putting aside a portion of income today to meet unexpected future expenses?',
    option_a: 'Emergency fund',
    option_b: 'Venture capital',
    option_c: 'Leverage',
    option_d: 'Arbitrage',
    correct_option: 'A',
    explanation: 'An emergency fund is liquid cash set aside to cover unexpected life emergencies without taking on debt.',
    difficulty: 'easy'
  },
  {
    topic: 'Money & Lifestyle',
    question: 'Which card allows you to borrow funds from a bank up to a pre-approved limit to pay for goods and services?',
    option_a: 'Debit Card',
    option_b: 'Credit Card',
    option_c: 'Aadhaar Card',
    option_d: 'Ration Card',
    correct_option: 'B',
    explanation: 'Credit cards provide a revolving credit line from the issuer which cardholders repay monthly.',
    difficulty: 'easy'
  },
  {
    topic: 'Money & Lifestyle',
    question: 'What is the economic term for the persistent general increase in prices and fall in the purchasing power of money?',
    option_a: 'Inflation',
    option_b: 'Deflation',
    option_c: 'Stagflation',
    option_d: 'Depreciation',
    correct_option: 'A',
    explanation: 'Inflation measures the rate at which the general level of prices for goods and services rises over time.',
    difficulty: 'medium'
  },
  {
    topic: 'Money & Lifestyle',
    question: 'In personal finance, what does the 50/30/20 budgeting rule suggest allocating 20% of net income toward?',
    option_a: 'Savings and debt repayment',
    option_b: 'Dining out and luxury travel',
    option_c: 'Rent and utilities',
    option_d: 'Groceries and commuting',
    correct_option: 'A',
    explanation: 'The 50/30/20 rule advises 50% for Needs, 30% for Wants, and 20% for Savings and debt reduction.',
    difficulty: 'medium'
  },
  {
    topic: 'Money & Lifestyle',
    question: 'What does SIP stand for in mutual fund investments?',
    option_a: 'Systematic Investment Plan',
    option_b: 'Secured Interest Program',
    option_c: 'Shareholder Income Portfolio',
    option_d: 'Standard Insurance Policy',
    correct_option: 'A',
    explanation: 'SIP stands for Systematic Investment Plan, allowing investors to invest a fixed sum at regular intervals.',
    difficulty: 'medium'
  },
  {
    topic: 'Money & Lifestyle',
    question: 'What does the regulatory acronym SEBI stand for in the Indian financial markets?',
    option_a: 'Securities and Exchange Board of India',
    option_b: 'State Economic Banking Institution',
    option_c: 'Stock Exchange Bureau of India',
    option_d: 'Savings and Equity Board of India',
    correct_option: 'A',
    explanation: 'SEBI (Securities and Exchange Board of India) regulates the securities and commodity market in India.',
    difficulty: 'medium'
  },
  {
    topic: 'Money & Lifestyle',
    question: 'In finance, what famous mental math rule estimates how many years it takes for an investment to double at a fixed annual return rate?',
    option_a: 'Rule of 72',
    option_b: 'Rule of 50',
    option_c: 'Rule of 100',
    option_d: 'Rule of 360',
    correct_option: 'A',
    explanation: 'The Rule of 72 divides 72 by the annual return rate to calculate the approximate doubling time (e.g. 72 / 8% = 9 years).',
    difficulty: 'hard'
  },
  {
    topic: 'Money & Lifestyle',
    question: 'What does the lifestyle movement acronym "F.I.R.E." stand for among extreme savers and index fund investors?',
    option_a: 'Financial Independence, Retire Early',
    option_b: 'Fiscal Investment and Real Estate',
    option_c: 'Fund Indexing for Rapid Earnings',
    option_d: 'Fixed Income and Regular Equities',
    correct_option: 'A',
    explanation: 'FIRE stands for Financial Independence, Retire Early, emphasizing high savings rates and low-cost index investing.',
    difficulty: 'hard'
  },

  // ============================================================================
  // 10. Funny & Random (10 Questions: 4 Easy, 4 Medium, 2 Hard)
  // ============================================================================
  {
    topic: 'Funny & Random',
    question: 'What can travel around the world while staying safely in its own corner?',
    option_a: 'A postage stamp',
    option_b: 'An airplane pilot',
    option_c: 'A postcard',
    option_d: 'A suitcase',
    correct_option: 'A',
    explanation: 'A postage stamp stays in the corner of an envelope as it travels across the globe!',
    difficulty: 'easy'
  },
  {
    topic: 'Funny & Random',
    question: 'What gets wetter and wetter the more it dries?',
    option_a: 'A towel',
    option_b: 'A sponge',
    option_c: 'An umbrella',
    option_d: 'A raincoat',
    correct_option: 'A',
    explanation: 'A towel absorbs water to dry you, becoming wetter in the process!',
    difficulty: 'easy'
  },
  {
    topic: 'Funny & Random',
    question: 'What has keys but cannot open any doors, and has space but no rooms?',
    option_a: 'A computer keyboard',
    option_b: 'A keyring',
    option_c: 'A piano bench',
    option_d: 'A dictionary',
    correct_option: 'A',
    explanation: 'A computer keyboard has letter keys, number keys, and a spacebar, but no rooms or locks!',
    difficulty: 'easy'
  },
  {
    topic: 'Funny & Random',
    question: 'What question can you never answer with a truthful "Yes"?',
    option_a: '"Are you asleep right now?"',
    option_b: '"Are you hungry?"',
    option_c: '"Is it morning?"',
    option_d: '"Can you hear me?"',
    correct_option: 'A',
    explanation: 'If you are genuinely asleep, you cannot consciously answer "Yes"!',
    difficulty: 'easy'
  },
  {
    topic: 'Funny & Random',
    question: 'David father has three sons: Snap, Crackle, and who is the third son?',
    option_a: 'David',
    option_b: 'Pop',
    option_c: 'John',
    option_d: 'Snap Jr.',
    correct_option: 'A',
    explanation: 'It is David father, so the third son is David!',
    difficulty: 'medium'
  },
  {
    topic: 'Funny & Random',
    question: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?',
    option_a: 'An echo',
    option_b: 'A whistle',
    option_c: 'A ghost',
    option_d: 'A kite',
    correct_option: 'A',
    explanation: 'An echo reflects sounds through air vibrations without any physical biological body!',
    difficulty: 'medium'
  },
  {
    topic: 'Funny & Random',
    question: 'If you are running in a marathon race and you overtake the person in second place, what position are you in?',
    option_a: 'Second place',
    option_b: 'First place',
    option_c: 'Third place',
    option_d: 'Fourth place',
    correct_option: 'A',
    explanation: 'When you pass the person in second place, you take their spot in second place!',
    difficulty: 'medium'
  },
  {
    topic: 'Funny & Random',
    question: 'What five-letter word becomes shorter when you add two letters to it?',
    option_a: 'Short',
    option_b: 'Brief',
    option_c: 'Small',
    option_d: 'Quick',
    correct_option: 'A',
    explanation: 'The word "Short" (5 letters) becomes "Shorter" (7 letters) when you add "er"!',
    difficulty: 'medium'
  },
  {
    topic: 'Funny & Random',
    question: 'A farmer had 17 sheep, and all but 9 died of an illness. How many living sheep does the farmer have left?',
    option_a: '8',
    option_b: '9',
    option_c: '0',
    option_d: '17',
    correct_option: 'B',
    explanation: 'Carefully read the phrasing: "all but 9 died", meaning exactly 9 survived!',
    difficulty: 'hard'
  },
  {
    topic: 'Funny & Random',
    question: 'Which word in the English dictionary is always spelled incorrectly?',
    option_a: 'Incorrectly',
    option_b: 'Misspell',
    option_c: 'Dumbfound',
    option_d: 'Pharaoh',
    correct_option: 'A',
    explanation: 'The word "Incorrectly" is literally spelled I-N-C-O-R-R-E-C-T-L-Y!',
    difficulty: 'hard'
  }
];

/**
 * Returns a single random question matching topic and optional difficulty,
 * respecting excluded question text to avoid duplicates.
 */
export function getRandomQuestionForTopic(
  topicName: string,
  difficulty?: 'easy' | 'medium' | 'hard',
  excludeQuestions: string[] = []
): BankQuestion {
  const normExclude = excludeQuestions.map((q) => q.toLowerCase().trim());

  let candidates = QUESTION_BANK.filter(
    (q) => q.topic.toLowerCase().trim() === topicName.toLowerCase().trim()
  );

  if (candidates.length === 0) {
    candidates = QUESTION_BANK.filter(
      (q) =>
        topicName.toLowerCase().includes(q.topic.toLowerCase()) ||
        q.topic.toLowerCase().includes(topicName.toLowerCase())
    );
  }

  if (candidates.length === 0) {
    candidates = QUESTION_BANK;
  }

  const unused = candidates.filter((q) => !normExclude.includes(q.question.toLowerCase().trim()));
  const pool = unused.length > 0 ? unused : candidates;

  if (difficulty) {
    const diffPool = pool.filter((q) => q.difficulty === difficulty);
    if (diffPool.length > 0) {
      return diffPool[Math.floor(Math.random() * diffPool.length)];
    }
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Returns a curated set of questions (default 7) for a topic matching the required mixed difficulty:
 * - 3 Easy questions
 * - 3 Medium questions
 * - 1 Hard question
 * Strictly guarantees distinct, non-duplicate questions.
 */
export function getBankQuestionsForTopic(
  topicName: string,
  count: number = 7,
  distribution: { easy: number; medium: number; hard: number } = { easy: 3, medium: 3, hard: 1 },
  excludeQuestions: string[] = []
): BankQuestion[] {
  const normExclude = new Set(excludeQuestions.map((q) => q.toLowerCase().trim()));
  const selected: BankQuestion[] = [];
  const selectedTexts = new Set<string>();

  // Find candidate pool for topic
  let candidates = QUESTION_BANK.filter(
    (q) => q.topic.toLowerCase().trim() === topicName.toLowerCase().trim()
  );
  if (candidates.length === 0) {
    candidates = QUESTION_BANK.filter(
      (q) =>
        topicName.toLowerCase().includes(q.topic.toLowerCase()) ||
        q.topic.toLowerCase().includes(topicName.toLowerCase())
    );
  }
  if (candidates.length === 0) {
    candidates = QUESTION_BANK;
  }

  const pickByDiff = (diff: 'easy' | 'medium' | 'hard', targetCount: number) => {
    const diffCandidates = candidates.filter(
      (q) =>
        q.difficulty === diff &&
        !normExclude.has(q.question.toLowerCase().trim()) &&
        !selectedTexts.has(q.question.toLowerCase().trim())
    );
    for (let i = 0; i < targetCount && i < diffCandidates.length; i++) {
      selected.push(diffCandidates[i]);
      selectedTexts.add(diffCandidates[i].question.toLowerCase().trim());
    }
  };

  // 1. Pick required distribution: 3 Easy, 3 Medium, 1 Hard
  pickByDiff('easy', distribution.easy);
  pickByDiff('medium', distribution.medium);
  pickByDiff('hard', distribution.hard);

  // 2. If count still short of requested count, fill with remaining unused candidates
  if (selected.length < count) {
    const remaining = candidates.filter(
      (q) =>
        !normExclude.has(q.question.toLowerCase().trim()) &&
        !selectedTexts.has(q.question.toLowerCase().trim())
    );
    for (const q of remaining) {
      if (selected.length >= count) break;
      selected.push(q);
      selectedTexts.add(q.question.toLowerCase().trim());
    }
  }

  return selected;
}
