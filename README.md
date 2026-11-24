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
- **Le tampon `AG`.** Chaque feuille est poinçonnée des initiales, en relief
  dans la marge. Le tampon en haut à gauche de l'écran ouvre le volet des
  feuilles : vos projets d'écriture, enregistrés en continu dans le
  navigateur (`localStorage`), exportables en `.txt` ou en PDF.
- **Exporter en PDF.** « Imprimer / PDF » dans le volet (ou `Ctrl`/`Cmd`+`P`)
  compose le texte sur de vraies pages A4, avec la même police et les mêmes
  marges — le dialogue d'impression du navigateur enregistre en PDF.

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
| clic sur le tampon `AG` | ouvre / ferme le volet des feuilles |
| `Échap` | ferme le volet |
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
