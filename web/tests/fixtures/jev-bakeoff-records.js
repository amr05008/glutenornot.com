/**
 * Real Open Food Facts records from the barcode bake-off
 * (plans/barcode-bakeoff-2026-09-24.md) with the scores Jev v2 (jev-1.13.0)
 * actually returned for them, recorded 2026-09-24 in jev-sandbox
 * experiments/07-barcode-bakeoff/raw/jev-v2-d2.jsonl. `opus` is Opus 4.8's
 * production verdict on the same record. They pin every reviewed miss of the
 * fast path's rule as a regression test (tests/api/fast-path.test.js):
 *   - listQuality: the texts v1 settled `safe` that aren't a usable list (the
 *     five on the tuning items, three v2 held on unseen data);
 *   - tofu: the graded run's one false-safe (trace tag `en:Glutine`);
 *   - riceSemolina: v1's false unsafe ("semoule de riz"; `v1Wheat` is v1's score);
 *   - wheatDextrose: "dextrose de blé", toggle T3;
 *   - missedTagForms: the gluten-family allergen/trace tags in the 996-record
 *     sample that the barcode path's `isGlutenFamilyTag` does not recognize.
 * Product names are left out: the rule never reads them.
 *
 * Data: © Open Food Facts contributors, https://world.openfoodfacts.org —
 * made available under the Open Database License (ODbL) v1.0
 * (https://opendatacommons.org/licenses/odbl/1-0/); individual contents under
 * the Database Contents License (https://opendatacommons.org/licenses/dbcl/1-0/).
 * Redistributed under the same terms. Changes: fields reduced to the barcode
 * path's lookup fields, the scanner's fetch as of 2026-09-24.
 */
export const JEV_BAKEOFF = {
  "listQuality": [
    {
      "id": "off-0034986062554",
      "note": "list cut off mid-word (\"…CHOCOLATE LIQUOR, CO\"); v1 settled safe",
      "opus": "caution/incomplete",
      "product": {
        "source": "openfoodfacts",
        "ingredients_text": "APPLE, CARAMEL (CORN SYRUP, MILK, SUGAR, DIPOTASSIUM PHOSPHATE, CARRAGEENAN, VITAMIN D-3, BUTTER, SALT, PALM OIL WITH SOY LECITHIN, PALM OIL, BUTTER VANILLA FLAVOR, MONO AND DIGLYCERIDES WITH CITRIC ACID), DARK CHOCOLATE CHIPS (SUGAR, CHOCOLATE LIQUOR, CO",
        "allergens_tags": [
          "en:apple",
          "en:milk"
        ],
        "traces_tags": [],
        "labels_tags": []
      },
      "scores": {
        "wheat": 0.03,
        "barley": 0.02,
        "rye": 0.01,
        "other_source": 0.03,
        "oats": 0.02,
        "may_contain": 0.06,
        "meat_poultry": 0.01,
        "soy_sauce": 0.01,
        "yeast_extract": 0.02,
        "is_ingredient_list": 0.99,
        "looks_complete": 0.02
      }
    },
    {
      "id": "off-8717953193407",
      "note": "nutrition text, not a list; v1 settled safe",
      "opus": "caution/incomplete",
      "product": {
        "source": "openfoodfacts",
        "ingredients_text": "Waarvan toegevoegde suikers 0.00g per 100 gram en waarvan toegevoegd zout 0.00g per 100 gram",
        "allergens_tags": [],
        "traces_tags": [],
        "labels_tags": [
          "en:vegetarian",
          "en:vegan"
        ]
      },
      "scores": {
        "wheat": 0.08,
        "barley": 0.05,
        "rye": 0.07,
        "other_source": 0.05,
        "oats": 0.11,
        "may_contain": 0.04,
        "meat_poultry": 0.13,
        "soy_sauce": 0.04,
        "yeast_extract": 0.04,
        "is_ingredient_list": 0.12,
        "looks_complete": 0.51
      }
    },
    {
      "id": "off-8590421620854",
      "note": "nutrition text, not a list; v1 settled safe",
      "opus": "caution/incomplete",
      "product": {
        "source": "openfoodfacts",
        "ingredients_text": "Waarvan toegevoegde suikers 0.00g per 100 milliliter en waarvan toegevoegd zout 0.00g per 100 milliliter",
        "allergens_tags": [],
        "traces_tags": [],
        "labels_tags": [
          "en:vegetarian"
        ]
      },
      "scores": {
        "wheat": 0.05,
        "barley": 0.05,
        "rye": 0.05,
        "other_source": 0.04,
        "oats": 0.06,
        "may_contain": 0.04,
        "meat_poultry": 0.07,
        "soy_sauce": 0.04,
        "yeast_extract": 0.04,
        "is_ingredient_list": 0.11,
        "looks_complete": 0.52
      }
    },
    {
      "id": "off-8431707094283",
      "note": "garbled OCR of a juice label; v1 settled safe",
      "opus": "caution/incomplete",
      "product": {
        "source": "openfoodfacts",
        "ingredients_text": "hechg a partir de concentrado con vitamina A, C, E y .\r\nVecomienda una dieta variada y equilibrada y un estilo de vida saludde\r\nprofeccion de los celulas frente al dano oxidativo. Se\r\nvitomina E, betacaroteno, aroma natural y vitamina D. Las C\r\nvituminas A, Cy D contribuyen al funcionamiento\r\nmgonihco y cope preferentemente en 34 dios. Consumin\r\nAeleraplemente antes del: ver el cuello de totplello. Beia\r\nrefrescante de Naranja, Zanahoria y uva parcialmeme\r\nhechg a partir de concentrado con vitamina A, C, E y\r\nContenido de fruta y vegetales: 80%. Ingredientes: zumo ue\r\nNoromjo o parfir de concentrado (28%) zumo de uva a pami e\r\nContentrado (22%), aqua, pure de zanahoria (15%), zum\r\nunohoria a partir de concentrado (12%), pulpa de nou\r\nZumo de limon a partir de concentrado (1%), vitamina\r\nnormal del sistema inmunitario. La vitamina E contribuye a\r\nY\r\nApite\r\nrigonifica e a an\r\nant\r\nrda\r\n431707 094283",
        "allergens_tags": [],
        "traces_tags": [],
        "labels_tags": [
          "en:no-added-sugar"
        ]
      },
      "scores": {
        "wheat": 0.02,
        "barley": 0.02,
        "rye": 0.02,
        "other_source": 0.03,
        "oats": 0.02,
        "may_contain": 0.03,
        "meat_poultry": 0.01,
        "soy_sauce": 0.01,
        "yeast_extract": 0.02,
        "is_ingredient_list": 0.84,
        "looks_complete": 0.11
      }
    },
    {
      "id": "off-01429507",
      "note": "medicine dosage instructions; v1 settled safe",
      "opus": "caution/incomplete",
      "product": {
        "source": "openfoodfacts",
        "ingredients_text": "istruzioni per l'uso adulti e adolescenti oltre i 12 anni: 1 compressa due-tre volte al giorno. deglutire la compressa intera. e possibile assumere momentact a stomaco vuoto. nei soggetti con problemi di tollerabilità gastrica, è preferibile assumere il medicinale a stomaco pieno. momentact è utilizzato, negli adulti e negli adolescenti a partire dai 12 anni, per trattare: dolori di varia origine e natura (mal di testa, mal di denti, nevralgie, dolori osteo-articolari e muscolari, dolori mestruali) e per aiutare a ridurre i sintomi degli stati febbrili ed influenzali. composizione ogni compressa contiene 400 mg di ibuprofene. momentact contiene lattosio, sodio. yote! momentact 400 mg 12 compresse rivestite con fim a035618026 a.c.raf s.p.a 031051324 031051324 12 compresse rivestite con film uso orale farmaco senza ricetta obbligo medicinale di automedicazione aic n° 035618026 titolare a.i.c.: aziende chimiche riunite angelini francesco a.c.r.a.f. s.p.a. - viale amelia 70, 00181 roma",
        "allergens_tags": [],
        "traces_tags": [],
        "labels_tags": []
      },
      "scores": {
        "wheat": 0.03,
        "barley": 0.02,
        "rye": 0.02,
        "other_source": 0.03,
        "oats": 0.01,
        "may_contain": 0.03,
        "meat_poultry": 0.01,
        "soy_sauce": 0.01,
        "yeast_extract": 0.02,
        "is_ingredient_list": 0.02,
        "looks_complete": 0.53
      }
    },
    {
      "id": "off-8445291930452",
      "note": "a product description, not a list; v2 held it on unseen data",
      "opus": "caution/incomplete",
      "product": {
        "source": "openfoodfacts",
        "ingredients_text": "Milk chocolate egg with caramel and fudge inclusions (10.0%).",
        "allergens_tags": [],
        "traces_tags": [],
        "labels_tags": []
      },
      "scores": {
        "wheat": 0.1,
        "barley": 0.07,
        "rye": 0.02,
        "other_source": 0.04,
        "oats": 0.02,
        "may_contain": 0.06,
        "meat_poultry": 0.01,
        "soy_sauce": 0.01,
        "yeast_extract": 0.02,
        "is_ingredient_list": 0.83,
        "looks_complete": 0.76
      }
    },
    {
      "id": "off-8718906926820",
      "note": "nutrition text, not a list; v2 held it on unseen data",
      "opus": "caution/incomplete",
      "product": {
        "source": "openfoodfacts",
        "ingredients_text": "Waarvan toegevoegde suikers 0.00g per 100 gram en waarvan toegevoegd zout 0.00g per 100 gram",
        "allergens_tags": [],
        "traces_tags": [],
        "labels_tags": [
          "en:vegetarian",
          "en:vegan"
        ]
      },
      "scores": {
        "wheat": 0.1,
        "barley": 0.05,
        "rye": 0.08,
        "other_source": 0.06,
        "oats": 0.12,
        "may_contain": 0.04,
        "meat_poultry": 0.13,
        "soy_sauce": 0.04,
        "yeast_extract": 0.04,
        "is_ingredient_list": 0.11,
        "looks_complete": 0.49
      }
    },
    {
      "id": "off-0859480003670",
      "note": "trail mix cut off mid-bracket; v2 held it on unseen data",
      "opus": "caution/incomplete",
      "product": {
        "source": "openfoodfacts",
        "ingredients_text": "Roasted almonds (almonds, canola and/or safflower oil, sea salt), coconut milk drops (sugar, palm kernel and palm oil, whey powder {milk}, nonfat dry milk powder, coconut milk powder {coconut milk, maltodextrin, sodium caseinate}, soy lecithin {emulsifier",
        "allergens_tags": [
          "en:milk",
          "en:nuts"
        ],
        "traces_tags": [],
        "labels_tags": []
      },
      "scores": {
        "wheat": 0.03,
        "barley": 0.07,
        "rye": 0.01,
        "other_source": 0.04,
        "oats": 0.01,
        "may_contain": 0.04,
        "meat_poultry": 0.01,
        "soy_sauce": 0.01,
        "yeast_extract": 0.02,
        "is_ingredient_list": 0.99,
        "looks_complete": 0.04
      }
    }
  ],
  "tofu": {
    "id": "off-8004263688304",
    "note": "tofu with trace tag en:Glutine; frozen v2 settled safe (the graded run's one false-safe)",
    "opus": "caution/may_contain",
    "product": {
      "source": "openfoodfacts",
      "ingredients_text": "Fagioli di soia* 58%, acqua, cloruro di magnesio. \r\n*Biologici.",
      "allergens_tags": [],
      "traces_tags": [
        "en:Glutine"
      ],
      "labels_tags": [
        "en:organic",
        "en:eu-organic"
      ]
    },
    "scores": {
      "wheat": 0.01,
      "barley": 0.01,
      "rye": 0.01,
      "other_source": 0.03,
      "oats": 0.01,
      "may_contain": 0.04,
      "meat_poultry": 0.01,
      "soy_sauce": 0.09,
      "yeast_extract": 0.02,
      "is_ingredient_list": 0.99,
      "looks_complete": 0.94
    }
  },
  "riceSemolina": {
    "id": "off-3245415633321",
    "note": "\"semoule de riz\" (rice semolina) in a beef dish; v1 wheat scored 0.65 and settled a false unsafe",
    "opus": "caution/undeclared_source",
    "product": {
      "source": "openfoodfacts",
      "ingredients_text": "viande de bœuf origine France 88 %, marinade 12 % (eau, tomate, maltodextrine, semoule de riz, épices, plantes aromatiques, huile végétale (tournesol, olive), arôme, lactate de potassium, acétate de sodium, sel, ascorbate de sodium",
      "allergens_tags": [],
      "traces_tags": [
        "en:celery",
        "en:eggs",
        "en:gluten",
        "en:milk",
        "en:mustard",
        "en:sesame-seeds",
        "en:soybeans"
      ],
      "labels_tags": [
        "en:french-meat",
        "en:french-beef"
      ]
    },
    "scores": {
      "wheat": 0.21,
      "barley": 0.14,
      "rye": 0.03,
      "other_source": 0.1,
      "oats": 0.02,
      "may_contain": 0.13,
      "meat_poultry": 0.99,
      "soy_sauce": 0.02,
      "yeast_extract": 0.03,
      "is_ingredient_list": 0.99,
      "looks_complete": 0.95
    },
    "v1Wheat": 0.65
  },
  "wheatDextrose": {
    "id": "off-3276440178679",
    "note": "duck mousse with \"dextrose de blé\"; v1 and v2 settled unsafe, Opus said caution/undeclared_source (T3)",
    "opus": "caution/undeclared_source",
    "product": {
      "source": "openfoodfacts",
      "ingredients_text": "Gras de canard, foie de canard (25 %), eau, foie de dinde, farine de riz, _lait_ écrémé en poudre, dextrose de blé et maïs, viande de canard, sel, stabilisants : E451, E450, arômes, épices et plantes aromatiques, antioxydants : E301, E300, conservateur : E250.",
      "allergens_tags": [
        "en:gluten",
        "en:milk"
      ],
      "traces_tags": [
        "en:eggs",
        "en:gluten",
        "en:mustard",
        "en:nuts",
        "en:soybeans"
      ],
      "labels_tags": [
        "en:french-meat",
        "en:halal",
        "en:french-poultry",
        "en:green-dot"
      ]
    },
    "scores": {
      "wheat": 0.95,
      "barley": 0.02,
      "rye": 0.02,
      "other_source": 0.09,
      "oats": 0.01,
      "may_contain": 0.2,
      "meat_poultry": 0.98,
      "soy_sauce": 0.02,
      "yeast_extract": 0.03,
      "is_ingredient_list": 0.99,
      "looks_complete": 0.89
    }
  },
  "missedTagForms": [
    {
      "tag": "de:Weizeneiweiß",
      "field": "allergens_tags",
      "id": "off-4316268668507"
    },
    {
      "tag": "en:Weizenmehl",
      "field": "allergens_tags",
      "id": "off-4250241207942"
    },
    {
      "tag": "en:Weizenstärke",
      "field": "allergens_tags",
      "id": "off-4250241207942"
    },
    {
      "tag": "fr:Weizenstärke",
      "field": "allergens_tags",
      "id": "off-5019503022650"
    },
    {
      "tag": "de:WEIZENMEH",
      "field": "allergens_tags",
      "id": "off-4388844020009"
    },
    {
      "tag": "en:cebada",
      "field": "allergens_tags",
      "id": "off-8445291919464"
    },
    {
      "tag": "en:trigo",
      "field": "allergens_tags",
      "id": "off-8445291919464"
    },
    {
      "tag": "es:Farinha de trigo",
      "field": "allergens_tags",
      "id": "off-4056489636663"
    },
    {
      "tag": "fr:TRITICALE",
      "field": "traces_tags",
      "id": "off-0059749903707"
    },
    {
      "tag": "it:Il prodotto puè contenere tracœ di frumento",
      "field": "traces_tags",
      "id": "off-0083480121519"
    },
    {
      "tag": "en:Glutine",
      "field": "traces_tags",
      "id": "off-8004263688304"
    },
    {
      "tag": "it:nocciole pistacchi glutine",
      "field": "traces_tags",
      "id": "off-8005851022227"
    },
    {
      "tag": "nl:Tarwee",
      "field": "traces_tags",
      "id": "off-8715017223183"
    },
    {
      "tag": "nl:tarwezemelen",
      "field": "allergens_tags",
      "id": "off-8710482532587"
    }
  ]
};
