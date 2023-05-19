import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

import Card from '@mui/material/Card';

import { Control, EndPointControl, Spline, Path, Vertex } from './math/path';
import { CanvasConfig } from './math/shape';
import Konva from 'konva';
import { Circle, Layer, Rect, Stage, Image, Line } from 'react-konva';

import fieldImageUrl from './static/field2023.png'
import useImage from 'use-image';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import Typography from '@mui/material/Typography';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TextField from '@mui/material/TextField';
import TreeView from '@mui/lab/TreeView';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TreeItem from '@mui/lab/TreeItem';

import { Input } from '@mui/icons-material';
import { Container } from '@mui/material';

class UserControl {
  public isPressingCtrl: boolean = false;
  public isPressingShift: boolean = false;
  public mouseX: number = 0;
  public mouseY: number = 0;
}

interface AppProps {
  paths: Path[];
  cc: CanvasConfig;
  uc: UserControl;
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
}

interface SplineElementProps extends AppProps {
  spline: Spline;
  path: Path;
}

interface SplineControlElementProps extends SplineElementProps {
  cp: EndPointControl | Control;
}

async function addSelected(props: SplineControlElementProps, uid: string) {
  return new Promise<boolean>((resolve, reject) => {
    props.setSelected((selected) => {
      if (selected.includes(uid)) {
        resolve(false);
        return selected;
      } else {
        resolve(true);
        return [...selected, uid];
      }
    });
  });
}

function useTimer(ms: number) {
  const [time, setTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setTime(Date.now()), ms);
    return () => {
      clearInterval(interval);
    };
  }, [ms]);

  return time;
}

function SplineControlVisualLineElement(props: { start: Vertex, end: Vertex, cc: CanvasConfig }) {
  const startInPx = props.cc.toPx(props.start);
  const endInPx = props.cc.toPx(props.end);

  const line_width = props.cc.pixelWidth / 600;

  return (
    <Line points={[startInPx.x, startInPx.y, endInPx.x, endInPx.y]} stroke="ffffff" strokeWidth={line_width} opacity={0.25} />
  )
}

function SplineKnotsHitBoxElement(props: SplineElementProps) {
  function onLineClick(event: Konva.KonvaEventObject<MouseEvent>) {
    let evt = event.evt;

    let cpInPx = new EndPointControl(evt.offsetX, evt.offsetY, 0);
    let cpInCm = props.cc.toCm(cpInPx);

    if (evt.button === 2) { // click
      props.path.splitSpline(props.spline, cpInCm);
    } else {
      if (props.spline.controls.length === 2)
        props.path.changeTo4ControlsCurve(props.spline);
      else
        props.path.changeToLine(props.spline);
    }
  }

  let points: number[] = [];

  for (let cp of props.spline.controls) {
    let cpInPx = props.cc.toPx(cp);
    points.push(cpInPx.x);
    points.push(cpInPx.y);
  }

  const knot_width = props.cc.pixelWidth / 320 * 2.5;

  return (
    <Line points={points} strokeWidth={knot_width} stroke={"red"} opacity={0} bezier={props.spline.controls.length > 2} onClick={onLineClick} />
  )
}

function SplineControlElement(props: SplineControlElementProps) {
  const [justSelected, setJustSelected] = useState(false);

  function onMouseDownControlPoint(event: Konva.KonvaEventObject<MouseEvent>) {
    const evt = event.evt;
    if (evt.button === 0) { // left click
      setJustSelected(false);

      if (props.uc.isPressingShift) {
        // add if not
        addSelected(props, props.cp.uid).then((added) => {
          if (added) {
            setJustSelected(true);
          }
        });
      } else {
        // set selection to this control point
        props.setSelected([props.cp.uid]);
      }
    }
  }

  function onClickControlPoint(event: Konva.KonvaEventObject<MouseEvent>) {
    const evt = event.evt;
    if (evt.button === 0) { // left click
      if (props.uc.isPressingShift) {
        // remove if already selected and it is not being added recently
        props.setSelected((selected) => {
          if (selected.includes(props.cp.uid) && !justSelected) {
            return selected.filter((uid) => uid !== props.cp.uid);
          } else {
            return selected;
          }
        });
      }
    }
  }

  function onDragControlPoint(event: Konva.KonvaEventObject<DragEvent>) {
    const evt = event.evt;

    const oldCpInCm = props.cp.clone();

    let cpInPx = new Vertex(evt.offsetX, evt.offsetY);
    let cpInCm = props.cc.toCm(cpInPx);
    cpInCm.fixPrecision();
    // first set the position of the control point so we can calculate the position of the follower control points
    props.cp.setXY(cpInCm);

    // CP 1 should follow CP 0, CP 2 should follow CP 3
    const isMainControl = props.cp instanceof EndPointControl;
    const shouldControlFollow = !props.uc.isPressingCtrl;
    const index = props.path.splines.indexOf(props.spline);
    const isLastOne = index + 1 === props.path.splines.length;
    const isCurve = props.spline.controls.length === 4;
    const isFirstCp = props.spline.first() === props.cp;

    const controls = props.path.getControlsSet();
    let followers: Control[] = [];
    let others: Control[] = [];
    for (let control of controls) {
      if (control === props.cp) continue;
      if (
        (!(control instanceof EndPointControl) && !shouldControlFollow) ||
        (!props.selected.includes(control.uid))
      ) {
        others.push(control);
      } else {
        followers.push(control);
      }
    }

    if (isMainControl && shouldControlFollow) {
      if (isCurve) {
        let control = isFirstCp ? props.spline.controls[1] : props.spline.controls[2];
        addSelected(props, control.uid);
        if (!followers.includes(control)) followers.push(control);
      }

      const nextSpline = props.path.splines[index + 1];
      if (!isLastOne && !isFirstCp && nextSpline !== undefined && nextSpline.controls.length === 4) {
        let control = nextSpline.controls[1];
        addSelected(props, control.uid);
        if (!followers.includes(control)) followers.push(control);
      }
    }

    if (props.uc.isPressingShift) {
      let magnetX = cpInCm.x;
      let magnetXDistance = Infinity;
      let magnetY = cpInCm.y;
      let magnetYDistance = Infinity;

      for (let cp of others) {
        let distance = cp.distance(cpInCm);
        if (Math.abs(cp.x - cpInCm.x) < props.cc.controlMagnetDistance && distance < magnetXDistance) {
          magnetX = cp.x;
          magnetXDistance = distance;
        }
        if (Math.abs(cp.y - cpInCm.y) < props.cc.controlMagnetDistance && distance < magnetYDistance) {
          magnetY = cp.y;
          magnetYDistance = distance;
        }
      }

      cpInCm.x = magnetX;
      cpInCm.y = magnetY;
    }

    for (let cp of followers) {
      cp.setXY(cpInCm.add(cp.subtract(oldCpInCm)));
    }

    props.cp.setXY(cpInCm);
    cpInPx = props.cc.toPx(cpInCm);
    event.target.x(cpInPx.x);
    event.target.y(cpInPx.y);
  }

  function onWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    let evt = event.evt;

    let epc = props.cp as EndPointControl;
    epc.heading += evt.deltaY / 10;
    epc.heading %= 360;
    if (epc.heading < 0) epc.heading += 360;
  }

  const lineWidth = props.cc.pixelWidth / 600;
  const cpRadius = props.cc.pixelWidth / 40;
  const cpInPx = props.cc.toPx(props.cp);
  const fillColor = props.selected.includes(props.cp.uid) ? "#0000ff4f" : "#0000ff2f";
  const isMainControl = props.cp instanceof EndPointControl;

  function onClickFirstOrLastControlPoint(event: Konva.KonvaEventObject<MouseEvent>) {
    let evt = event.evt;

    onClickControlPoint(event);
    if (evt.button === 2) { // right click
      let removedControls = props.path.removeSplineByFirstOrLastControlPoint(props.cp as EndPointControl);
      let removed = removedControls.map((control) => control.uid);

      props.setSelected((selected) => selected.filter((uid) => !removed.includes(uid)));
    }
  }

  return (
    <>
      {
        isMainControl ? (
          <>
            <Line points={[
              cpInPx.x, cpInPx.y,
              cpInPx.x + Math.sin(-((cpInPx as EndPointControl).headingInRadian() - Math.PI)) * cpRadius,
              cpInPx.y + Math.cos(-((cpInPx as EndPointControl).headingInRadian() - Math.PI)) * cpRadius
            ]} stroke="ffffff" strokeWidth={lineWidth} />
            <Circle x={cpInPx.x} y={cpInPx.y} radius={cpRadius} fill={fillColor}
              draggable onDragMove={onDragControlPoint} onMouseDown={onMouseDownControlPoint} onWheel={onWheel} onClick={onClickFirstOrLastControlPoint} />
          </>
        ) : (
          <Circle x={cpInPx.x} y={cpInPx.y} radius={cpRadius / 2} fill={fillColor}
            draggable onDragMove={onDragControlPoint} onMouseDown={onMouseDownControlPoint} />
        )
      }

    </>
  )
}

function SplineElement(props: SplineElementProps) {
  let isFirstSpline = props.path.splines[0] === props.spline;

  let knotRadius = props.cc.pixelWidth / 320;

  return (
    <>
      {props.spline.calculateKnots(props.cc).map((knotInCm, index) => {
        let knotInPx = props.cc.toPx(knotInCm);
        return (
          <Circle key={index} x={knotInPx.x} y={knotInPx.y} radius={knotRadius} fill="#00ff00ff" />
        )
      })}
      {
        props.spline.controls.length === 4 ? (
          <>
            <SplineControlVisualLineElement start={props.spline.controls[0]} end={props.spline.controls[1]} cc={props.cc} />
            <SplineControlVisualLineElement start={props.spline.controls[2]} end={props.spline.controls[3]} cc={props.cc} />
          </>
        ) : null
      }
      <SplineKnotsHitBoxElement {...props} />
      {props.spline.controls.map((cpInCm, index) => {
        if (!isFirstSpline && index === 0) return null;
        return (
          <SplineControlElement key={index} {...props} cp={cpInCm} />
        )
      })}
    </>
  )
}

function FieldCanvasElement(props: AppProps) {
  // useTimer(1000 / 30);

  const cc = props.cc;
  const paths = props.paths;

  const [fieldImage] = useImage(fieldImageUrl);

  function onClickFieldImage(event: Konva.KonvaEventObject<MouseEvent>) {
    let evt = event.evt;

    if (evt.button === 2) { // click
      paths[0].addLine(cc.toCm(new EndPointControl(evt.offsetX, evt.offsetY, 0)));
    } else {
      paths[0].add4ControlsCurve(cc.toCm(new EndPointControl(evt.offsetX, evt.offsetY, 0)));
    }
  }

  return (
    <Stage className='field-canvas' width={cc.pixelWidth} height={cc.pixelHeight} onContextMenu={(e) => e.evt.preventDefault()}>
      <Layer>
        <Image image={fieldImage} width={cc.pixelWidth} height={cc.pixelHeight} onClick={onClickFieldImage} />
        {
          paths.map((path, index) => {
            return (
              <React.Fragment key={index}>
                {path.splines.map((spline) => {
                  return (
                    <SplineElement key={spline.uid} {...{ spline, path, ...props }} />
                  )
                })}
              </React.Fragment>
            )
          })
        }
      </Layer>
    </Stage>
  )
}

function PathTreeItemElement(props: { path: Path }) {
  const path = props.path;

  const defaultValue = useRef(path.name);

  function onPathNameChange(event: React.FormEvent<HTMLSpanElement>, path: Path) {
    path.name = event.currentTarget.innerText;
  }

  return (
    <TreeItem nodeId={path.uid} label={
      <>
        <span contentEditable
          style={{ display: 'inline-block' }}
          onInput={(e) => onPathNameChange(e, path)}
          // onLoad={(e) => e.currentTarget.innerText = path.name}
          suppressContentEditableWarning={true}
          dangerouslySetInnerHTML={{ __html: defaultValue.current }} // XXX
        />
      </>
    } >
      {
        path.getControlsSet().map((control, controlIdx) => {
          return (
            <TreeItem nodeId={control.uid} key={control.uid} label={control instanceof EndPointControl ? "End Point Control" : "Control"} />
          )
        })
      }
    </TreeItem>
  )
}

function App() {
  useTimer(1000 / 30);

  const paths = useMemo(() => [
    new Path(new Spline(new EndPointControl(-60, -60, 0), [], new EndPointControl(-60, 60, 0))),
    new Path(new Spline(new EndPointControl(60, -60, 0), [], new EndPointControl(60, 60, 0)))
  ], []);

  const [userControl, setUserControl] = useState(new UserControl());

  const [selected, setSelected] = useState<string[]>([]);

  const cc = new CanvasConfig(window.innerHeight * 0.94, window.innerHeight * 0.94, 365.76, 365.76);

  function onKeyDown(event: KeyboardEvent) {
    let isCtrl = event.ctrlKey || event.metaKey;
    let isShift = event.shiftKey;
    setUserControl((uc) => ({ ...uc, isPressingCtrl: isCtrl, isPressingShift: isShift }));
  }

  function onKeyUp(event: KeyboardEvent) {
    let isCtrl = event.ctrlKey || event.metaKey;
    let isShift = event.shiftKey;
    setUserControl((uc) => ({ ...uc, isPressingCtrl: isCtrl, isPressingShift: isShift }));
  }

  function onMouseMove(event: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    // setUserControl({ ...userControl, mouseX: event.offsetX, mouseY: event.offsetY });
  }

  useEffect(() => {
    document.body.addEventListener('keydown', onKeyDown);
    document.body.addEventListener('keyup', onKeyUp);

    return () => {
      document.body.removeEventListener('keydown', onKeyDown);
      document.body.removeEventListener('keyup', onKeyUp);
    }
  }, []);

  const multiSelect = selected.length !== 1;
  let xInput = "", yInput = "", headingInput = "";
  let xDisabled = true, yDisabled = true, headingDisabled = true, headingHide = false;
  if (selected.length > 1) {
    xInput = "(mixed)";
    yInput = "(mixed)";
    headingInput = "(mixed)";
  } else if (selected.length === 1) {
    // let selectedControl = paths[0].getControlsSet().find((control) => control.uid === selected[0]);
    let selectedControl = paths.map(
      (path) => path.getControlsSet().find((control) => control.uid === selected[0])
    ).find((control) => control !== undefined);
    if (selectedControl !== undefined) {
      xInput = selectedControl.x.toString();
      yInput = selectedControl.y.toString();
      xDisabled = false;
      yDisabled = false;
      if (selectedControl instanceof EndPointControl) {
        headingInput = selectedControl.heading.toString();
        headingDisabled = false;
      } else {
        headingHide = true;
      }
    }
  }

  return (
    <div className='App'>
      <Card className='field-container' onMouseMove={onMouseMove}>
        <FieldCanvasElement {...{ paths, cc, uc: userControl, selected, setSelected }} />
      </Card>

      <div className='editor-container'>
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>Robot Configuration</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <TextField
              label="Width"
              id="outlined-size-small"
              defaultValue="30"
              size="small"
              sx={{ marginBottom: "1vh", marginRight: "1vh" }}
            />
            <TextField
              label="Height"
              id="outlined-size-small"
              defaultValue="30"
              size="small"
              sx={{ marginBottom: "1vh", marginRight: "1vh" }}
            />
          </AccordionDetails>
        </Accordion>
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>Output</Typography>
          </AccordionSummary>
          <AccordionDetails>

          </AccordionDetails>
        </Accordion>
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>Paths</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <div style={{ textAlign: "left", marginBottom: "3vh" }}>
              <TextField
                label="X"
                id="outlined-size-small"
                defaultValue=""
                size="small"
                sx={{ width: "calc(33.3% - 1vh)", marginRight: "1vh" }}
                value={xInput}
                disabled={xDisabled}
              />
              <TextField
                label="Y"
                id="outlined-size-small"
                defaultValue=""
                size="small"
                sx={{ width: "calc(33.3% - 1vh)", marginRight: "1vh" }}
                value={yInput}
                disabled={yDisabled}
              />
              <TextField
                label="Heading"
                id="outlined-size-small"
                defaultValue=""
                size="small"
                sx={{ width: "calc(33.3% - 1vh)", marginRight: "1vh" }}
                value={headingInput}
                disabled={headingDisabled}
                style={{ display: headingHide ? "none" : "" }}
              />
            </div>
            <TreeView
              defaultCollapseIcon={<ExpandMoreIcon />}
              defaultExpandIcon={<ChevronRightIcon />}
              multiSelect
              selected={selected}
              onNodeSelect={(event, nodeIds) => setSelected(nodeIds)}
              sx={{ flexGrow: 1, maxWidth: "100%", overflowX: 'hidden', overflowY: 'auto', marginBottom: "2vh" }}
            >
              {
                paths.map((path, pathIdx) => {
                  return (
                    <PathTreeItemElement key={path.uid} path={path} />
                  )
                })
              }
            </TreeView>
          </AccordionDetails>
        </Accordion>
      </div>
    </div>
  );
}

export default App;
