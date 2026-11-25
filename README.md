# Machine à écrire

Un éditeur de texte des plus sobres, au ressenti machine à écrire.

![Capture d'écran](docs/capture.jpg)

Des feuilles A4 au grain léger, une ligne de frappe fixe : on engage la
première page, on écrit depuis le haut, et le papier remonte à chaque retour
chariot, comme autour du cylindre. Pas de barre d'outils, pas de menus —
juste l'écriture.

## L'essentiel

- **Le papier dans la machine.** La feuille A4 s'engage sous la ligne de
  frappe, le texte commence en haut de la page, et c'est le papier qui monte,
  ligne après ligne. Page pleine : la suivante s'engage à sa suite. Un petit
  index sur le rail, en bas, suit la position du chariot.
- **Un vrai éditeur.** Curseur, sélection (clic, double-clic, glisser),
  insertion au milieu du texte, annuler/rétablir, copier-coller. La molette
  fait défiler les feuilles pour se relire ; on repositionne le chariot d'un
  clic, et c'est la frappe qui ramène la ligne au point de frappe.
- **Les sons d'une vraie machine.** Frappe et relâchement des touches, retour
  chariot, sonnette à l'approche de la marge droite : de vrais
  enregistrements (projet [daktilo](https://github.com/orhun/daktilo),
  MIT/Apache-2.0), avec de légères variations à chaque frappe. Débrayables.
- **Le poinçon.** Chaque feuille porte, au coin supérieur gauche de sa
  marge, un curseur de texte stylisé poinçonné à l'encre passée ; il voyage
  avec le papier. Un clic dessus (ou `Échap`) ouvre le volet des feuilles :
  vos projets d'écriture, enregistrés en continu dans le navigateur
  (`localStorage`), exportables en `.txt` ou en PDF.
- **Le fond, au choix.** Six ambiances dans le volet : le bureau, deux
  dégradés doux (aube, lagune), une tapisserie fleurie de grand-mère, et
  deux semis façon fonds de messagerie — lettres sur bleu nuit, et
  iconographie steampunk sur beige. Tout est dessiné en SVG, dans `bg/`.
- **Exporter en PDF.** « Imprimer / PDF » dans le volet (ou `Ctrl`/`Cmd`+`P`)
  compose le texte sur de vraies pages A4, avec la même police et les mêmes
  marges — le dialogue d'impression du navigateur enregistre en PDF.
- **Le mode machine.** C'est la manière par défaut d'utiliser l'éditeur
  (débrayable dans le volet pour retrouver l'édition libre) : l'éditeur a
  les manières d'une vraie machine. Plus de retour à la ligne automatique — la
  sonnette avertit, puis le chariot bute contre la marge et les lettres
  s'écrasent les unes sur les autres, en pâté. Le retour chariot est à vous
  (`Entrée`). Rien ne s'efface : le retour arrière recule le chariot sans
  toucher au papier, et l'on corrige en surfrappant — la nouvelle lettre
  s'imprime sur l'ancienne, les deux encres restent. L'espace n'imprime
  rien, il avance. Coller et couper sont inconnus de la machine. Les
  surfrappes restent sur la feuille même de retour en mode normal : ce sont
  les cicatrices du premier jet. L'export `.txt` et le PDF donnent, eux, la
  copie au propre.
- **Le blanco.** « Poser du blanco » dans le volet, puis sélectionner le
  texte à couvrir : une couche d'un blanc plus clair que le papier se pose
  sur les caractères — ce n'est pas un effacement, la peinture est sur la
  feuille. On retape ensuite par-dessus, la lettre neuve s'imprime sur la
  couche. À l'export, ce qui reste couvert devient du blanc. `Échap` pour
  renoncer au pinceau.

## Utilisation

Ouvrir `index.html` dans un navigateur, et écrire. C'est tout.

Aucune dépendance, aucun outil de build, aucun serveur : trois fichiers
statiques et une police embarquée. Pour servir le dossier localement :

```bash
python3 -m http.server 8000
```

### Gestes

| Geste | Effet |
|---|---|
| clic sur le poinçon d'une feuille | ouvre / ferme le volet des feuilles |
| `Échap` | ouvre / ferme le volet |
| molette / toucher | fait défiler les feuilles |
| clic, double-clic, glisser | place le chariot, sélectionne un mot, une plage |
| `Ctrl`/`Cmd` + `P` | imprime / exporte en PDF |
| `Tab` | tabulation (quatre espaces) |

## Données

Les feuilles vivent dans le `localStorage` du navigateur : rien ne quitte
votre machine. L'enregistrement est automatique à chaque frappe. Le volet
permet d'exporter la feuille courante en `.txt`.

## Crédits

- Police [Special Elite](https://fonts.google.com/specimen/Special+Elite)
  d'Astigmatic (Apache License 2.0), embarquée dans `fonts/`.
- Sons de machine à écrire du projet
  [daktilo](https://github.com/orhun/daktilo) d'Orhun Parmaksız
  (MIT / Apache-2.0), embarqués dans `sounds/`.
