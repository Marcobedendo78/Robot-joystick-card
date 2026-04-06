# Robot Joystick Card

![Preview](https://raw.githubusercontent.com/Marcobedendo78/Robot-joystick-card/main/preview.png)

Custom card per Home Assistant pensata per controllare un robot tagliaerba Arduino via MQTT.

La card include:
- joystick touch per controllo manuale
- pulsanti Start / Stop / Exit Dock / Dock
- modalità Manuale / Automatico
- stato batteria con icona dinamica
- corrente batteria
- stato loop
- pannello stato robot con animazione falciatura
- immagine del robot inclusa nel pacchetto HACS

## Installazione con HACS

### Repository personalizzato

1. Apri HACS
2. Vai su **Repository personalizzati**
3. Incolla il link del repository GitHub
4. Seleziona la categoria **Dashboard**
5. Installa la card
6. Riavvia Home Assistant oppure fai reload del frontend

Dopo l'installazione la card comparirà nella lista delle card come:

**Robot Joystick Card**

L'immagine `robot.jpg` è inclusa nel repository e viene caricata automaticamente dalla card, senza dover copiare file in `/local`.

## Installazione manuale

1. Copia `robot-joystick-card.js` e `robot.jpg` nella stessa cartella, ad esempio:

```text
/config/www/robot-joystick-card/
```

2. Aggiungi la resource:

```yaml
lovelace:
  resources:
    - url: /local/robot-joystick-card/robot-joystick-card.js
      type: module
```

3. Riavvia o ricarica il frontend.

## Configurazione esempio

```yaml
type: custom:robot-joystick-card
title: Robot Tagliaerba
topic: home/robot/mower/control/joystick
command_topic: home/robot/mower/control
battery_entity: sensor.mower_battery
battery_amps_entity: sensor.robotmowerbatteryamps
charge_entity: sensor.mower_charge
loop_entity: sensor.mower_loop
running_entity: sensor.mower_running
parked_entity: sensor.mower_parked
docked_entity: sensor.mower_docked
tracking_entity: sensor.mower_tracking
batt_min_voltage: 28.0
batt_max_voltage: 33.6
```

## Configurazione con immagine personalizzata

```yaml
type: custom:robot-joystick-card
robot_image: /local/robot-arduino/Robot.jpg
```

## Opzioni disponibili

| Opzione | Default | Descrizione |
|---|---|---|
| `title` | `Robot Tagliaerba` | Titolo della card |
| `topic` | `home/robot/mower/control/joystick` | Topic MQTT del joystick |
| `command_topic` | `home/robot/mower/control` | Topic MQTT per i comandi |
| `max_distance` | `110` | Raggio massimo joystick |
| `deadzone` | `0.06` | Zona morta joystick |
| `publish_interval` | `40` | Intervallo pubblicazione MQTT |
| `battery_entity` | `sensor.mower_battery` | Sensore tensione batteria |
| `battery_amps_entity` | `sensor.robotmowerbatteryamps` | Sensore corrente batteria |
| `charge_entity` | `sensor.mower_charge` | Sensore stato carica |
| `loop_entity` | `sensor.mower_loop` | Sensore loop filo |
| `running_entity` | `sensor.mower_running` | Sensore stato falciatura |
| `parked_entity` | `sensor.mower_parked` | Sensore stato parcheggio |
| `docked_entity` | `sensor.mower_docked` | Sensore stato base |
| `tracking_entity` | `sensor.mower_tracking` | Sensore tracking filo |
| `robot_image` | immagine inclusa | Immagine di sfondo card |
| `batt_min_voltage` | `28.0` | Tensione minima batteria |
| `batt_max_voltage` | `33.6` | Tensione massima batteria |

## Note

- La card usa il servizio `mqtt.publish`
- È necessario che l'integrazione MQTT sia configurata in Home Assistant
- L'immagine inclusa viene risolta automaticamente tramite il percorso del modulo HACS

## Release HACS

Per distribuire correttamente la card:
1. crea il repository GitHub pubblico
2. carica questi file nella root
3. crea un tag, ad esempio `v1.0.0`
4. crea una GitHub Release `v1.0.0`
5. aggiungi il repository in HACS come repository personalizzato di tipo **Dashboard**

## Licenza

MIT
