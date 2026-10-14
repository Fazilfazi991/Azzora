# UI correction intent

The existing Architectural Prestige design system is authoritative; no new theme or motion.

Recovery component intent: a CRM owner must preserve customer, contract and site records and obtain a usable backup when saved data cannot open. The original-data export is the primary action; retry and Settings follow it. Existing rust primary buttons, warm neutral panel, espresso text, subtle stone borders, Space Grotesk headings and Inter body retain the application's hierarchy. Use existing 24px panel spacing, 8px rhythm and native button/link semantics. Recovery remains outside the app rendering boundary, with a named region and visible error. No automatic reset or write is offered.

Document reviewer field intent: show the actual assigned independent reviewer before submission using the existing Field/native-select pattern and active employee names. Approval history remains reachable in All decisions; superseded reviews are explicitly labelled, never presented as active decisions.

React review: lazy bootstrap reads saved storage once per initialization; migrations do not save; mutations clone and save once before visible-state commit; rendering errors isolate the app while retaining export; no new third-party UI dependencies; existing lazy document/PDF imports retained. Desktop/mobile recovery output and reviewer workflows must pass the final browser/visual gate.

Final interaction follow-ups (assigned,not yet certified): search/navigation must dismiss the old query while retaining a new query typed after destination selection,including delayed route events,back/forward and same-route results. Ordinary boundary tests now wait destination heading/active tab; focused regression deliberately delays events. Native quotation printing must preserve existing A4 typography/brand while preventing an inline SVG line box from adding a blank trailing page. Actual native PDF page counts/text and rendered pages govern acceptance; DOM sheet counts alone are insufficient. No motion,new theme or layout redesign is introduced.
