---
title: Calibration
description: Align KITTY's eye sockets and jaw hinge to the subject's anatomy.
---

Every feline's facial geometry is unique. Click **Calibrate Eyes and Mouth** in the lower control bar to unlock the live alignment HUD.

| Action | Mouse / trackpad | Touch screen |
| :--- | :--- | :--- |
| Move a feature | Drag the **Left Eye**, **Right Eye**, or **Mouth / Jaw Hinge** handle | Drag with one finger |
| Resize a feature | Scroll wheel over the handle | Pinch with two fingers over the handle |

## Saving your calibration

Tick **Dev Mode** to show the live `SUBJECTS[0]` coordinates, then click **Copy Config** and paste the values into the `SUBJECTS` array in [`kitty/src/components/KittySpeaker.vue`](https://github.com/infrashift/kitty-event-bus-client/blob/main/kitty/src/components/KittySpeaker.vue).
