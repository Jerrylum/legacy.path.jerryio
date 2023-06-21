import './App.scss';

import { Path } from './types/Path';

import { action } from "mobx"
import { observer } from "mobx-react-lite"

import { ThemeProvider } from '@mui/material/styles';

import { Box, Card } from '@mui/material';
import { useCustomHotkeys, useTimer, useUnsavedChangesPrompt } from './app/Util';
import { MenuAccordion } from './app/MenuAccordion';
import { PathTreeAccordion } from './app/PathTreeAccordion';
import { GeneralConfigAccordion } from './app/GeneralConfigAccordion';
import { PathConfigAccordion } from './app/PathAccordion';
import { ControlAccordion } from './app/ControlAccordion';
import { GraphCanvasElement } from './app/GraphCanvasElement';
import { FieldCanvasElement } from './app/FieldCanvasElement';
import { MainApp, useAppStores } from './app/MainApp';

import React from 'react';
import { onDownload, onNew, onOpen, onSave, onSaveAs } from './format/Output';
import { NoticeProvider } from './app/Notice';
import { ConfirmationDialog } from './app/Confirmation';
import { HelpDialog } from './app/HelpDialog';
import { PreferencesDialog } from './app/Preferences';
import { NumberInUnit, UnitOfLength } from './types/Unit';
import { getPathPoints } from './types/Calculation';

import { getAppStores } from './app/MainApp';
import { getBezierCurvePoints, getSegmentSamplePoints, getPathSamplePoints, getUniformPointsFromSamples } from './types/Calculation';

// @ts-ignore
window.testFunction = action(() => {
  console.log("hello!");

  const { app } = getAppStores();

  const density = new NumberInUnit(2, UnitOfLength.Centimeter);

  for (const path of app.paths) {
    console.log("path", path.uid);

    // for (const segment of path.segments) {
    //   console.log(getBezierCurvePoints(segment, 0.01, 0));
    // }

    // for (const segment of path.segments) {
    //   console.log(getSegmentSamplePoints(segment, new NumberInUnit(2, UnitOfLength.Centimeter), 0));
    // }

    const sampleResult = getPathSamplePoints(path, density);
    console.log(sampleResult);
    const uniformResult = getUniformPointsFromSamples(sampleResult, density);
    console.log(uniformResult);

  }
});
// @ts-ignore
window.testFunction();

export interface AppProps {
  paths: Path[];

  app: MainApp;
}

const App = observer(() => {
  useTimer(1000 / 30);

  const { app, confirmation, help, appPreferences } = useAppStores();

  React.useEffect(action(() => { // eslint-disable-line react-hooks/exhaustive-deps
    const density = new NumberInUnit(app.gc.pointDensity, app.gc.uol);
    const interested = app.interestedPath();

    app.paths.filter(path => path.visible || path === interested).forEach(path => path.cachedResult = getPathPoints(path, density));
  }), undefined);

  const optionsToEnableHotkeys = { enabled: !confirmation.isOpen && !help.isOpen && !appPreferences.isOpen };

  // UX: Enable custom hotkeys on input fields (e.g. Ctrl+S) to prevent accidentally triggering the browser default
  // hotkeys when focusing them (e.g. Save page). However, we do not apply it to all hotkeys, because we want to keep
  // some browser default hotkeys on input fields (e.g. Ctrl+Z to undo user input) instead of triggering custom hotkeys
  // (e.g. Ctrl+Z to undo field change)
  const optionsToEnableHotkeysOnInputFields = { enableOnContentEditable: true, ...optionsToEnableHotkeys };

  useCustomHotkeys("Ctrl+P", onNew.bind(null, app, confirmation), optionsToEnableHotkeysOnInputFields);
  useCustomHotkeys("Ctrl+O", onOpen.bind(null, app, confirmation), optionsToEnableHotkeysOnInputFields);
  useCustomHotkeys("Ctrl+S", onSave.bind(null, app), optionsToEnableHotkeysOnInputFields);
  useCustomHotkeys("Ctrl+Shift+S", onSaveAs.bind(null, app), optionsToEnableHotkeysOnInputFields);
  useCustomHotkeys("Ctrl+D", onDownload.bind(null, app), optionsToEnableHotkeysOnInputFields);
  useCustomHotkeys("Ctrl+Comma", () => appPreferences.open(), optionsToEnableHotkeys);

  useCustomHotkeys("Ctrl+Z", () => app.history.undo(), optionsToEnableHotkeys);
  useCustomHotkeys("Ctrl+Y,Ctrl+Shift+Z", () => app.history.redo(), optionsToEnableHotkeys);
  useCustomHotkeys("Ctrl+A", () => {
    const path = app.selectedPath;
    const all = path !== undefined ? [path, ...path.controls] : app.allEntities;
    app.setSelected(all);
  }, optionsToEnableHotkeys);
  useCustomHotkeys("Esc", () => app.clearSelected(), optionsToEnableHotkeys);
  useCustomHotkeys("Ctrl+Shift+A", () => {
    const path = app.selectedPath;
    const all = path !== undefined ? [path, ...path.controls] : app.allEntities;
    app.setSelected(all.filter(e => !app.selectedEntities.includes(e)));
  }, optionsToEnableHotkeys);

  useCustomHotkeys("Ctrl+B", () => app.view.showSpeedCanvas = !app.view.showSpeedCanvas, optionsToEnableHotkeys);
  useCustomHotkeys("Ctrl+J", () => app.view.showRightPanel = !app.view.showRightPanel, optionsToEnableHotkeys);

  useCustomHotkeys("Ctrl+Add,Ctrl+Equal", () => app.fieldScale += 0.5, optionsToEnableHotkeys);
  useCustomHotkeys("Ctrl+Subtract,Ctrl+Minus", () => app.fieldScale -= 0.5, optionsToEnableHotkeys);
  useCustomHotkeys("Ctrl+0", () => app.resetFieldDisplay(), optionsToEnableHotkeys);

  useCustomHotkeys("r", () => app.gc.showRobot = !app.gc.showRobot, {
    ...optionsToEnableHotkeys,
    enableOnFormTags: ['input', "INPUT"],
    // UX: A special case for input[type="checkbox"], it is okay to enable hotkeys on it
    enabled: (kvEvt: KeyboardEvent) =>
      (kvEvt.target instanceof HTMLInputElement) === false ||
      (kvEvt.target as HTMLInputElement).type === "checkbox",
  });

  useUnsavedChangesPrompt();

  // XXX: set key so that the component will be reset when format is changed or app.gc.uol is changed
  return (
    <div tabIndex={-1} className={["App", appPreferences.theme.className].join(" ")} key={app.format.uid + "-" + app.gc.uol}>
      <ThemeProvider theme={appPreferences.theme.theme}>
        <NoticeProvider />
        <Box id='left-editor-panel'>
          <MenuAccordion />
          <PathTreeAccordion />
        </Box>

        <Box id='middle-panel' className={app.view.showSpeedCanvas ? "" : "full-height"}>
          <Card id='field-panel'>
            <FieldCanvasElement />
          </Card>
          {
            app.view.showSpeedCanvas && (
              <Card id='graph-panel'>
                <GraphCanvasElement />
              </Card>
            )
          }
        </Box>
        {
          app.view.showRightPanel && (
            <Box id='right-editor-panel'>
              <GeneralConfigAccordion />
              <ControlAccordion />
              <PathConfigAccordion />
            </Box>
          )
        }
        <ConfirmationDialog />
        <HelpDialog />
        <PreferencesDialog />
      </ThemeProvider>
    </div>
  );
});

export default App;

