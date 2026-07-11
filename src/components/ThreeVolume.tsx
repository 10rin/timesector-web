import { useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// Propsの定義
interface ThreeVolumeProps {
  toolMode: 'rotate' | 'draw';
  volW: number;
  volH: number;
  volD: number;
  volumeOpacity: number;
  textures: {
    front: THREE.CanvasTexture | null;
    back: THREE.CanvasTexture | null;
    left: THREE.CanvasTexture | null;
    right: THREE.CanvasTexture | null;
    top: THREE.CanvasTexture | null;
    bottom: THREE.CanvasTexture | null;
  };
  curtains: Array<{
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
  }>;
  playOffset: number;       // ★同期用Props
  scanFrames: number;       // ★同期用Props
  sweepAxis: 'X' | 'Y' | 'Z'; // ★同期用Props
  onDrawComplete: (points: THREE.Vector3[], direction: 'X' | 'Y' | 'Z') => void;
  onDrawProgress: (points: THREE.Vector3[], direction: 'X' | 'Y' | 'Z') => void; // ドラッグ中リアルタイム同期
  onDrawStart: () => void;
  onPointSampled: (point: THREE.Vector3, status: 'START' | 'DRAW') => void;
}

// 3Dボリューム本体（直方体）とドローイング入力を制御するインナーステージ
function SpacetimeVolumeStage({
  toolMode,
  volW,
  volH,
  volD,
  volumeOpacity,
  textures,
  curtains,
  playOffset,
  scanFrames,
  sweepAxis,
  onDrawComplete,
  onDrawProgress,
  onDrawStart,
  onPointSampled
}: Omit<ThreeVolumeProps, 'canvasRef'>) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [linePoints, setLinePoints] = useState<THREE.Vector3[]>([]);
  const linePointsRef = useRef<THREE.Vector3[]>([]); // ★最新座標の同期的保持用 (非同期ステートによる二重取得バグを防止)
  const drawDirectionRef = useRef<'X' | 'Y' | 'Z'>('Z');

  // マテリアルの更新監視
  useEffect(() => {
    if (meshRef.current) {
      const mats = meshRef.current.material as THREE.MeshBasicMaterial[];
      if (Array.isArray(mats)) {
        mats.forEach(m => {
          m.transparent = volumeOpacity < 1.0;
          m.opacity = volumeOpacity;
          m.needsUpdate = true;
        });
      }
    }
  }, [volumeOpacity, textures]);

  // ポンダーダウン (ドラッグ開始)
  const handlePointerDown = (e: any) => {
    if (toolMode !== 'draw') return;
    e.stopPropagation();

    onDrawStart();
    setIsDrawing(true);

    const point = e.point.clone();
    const newPoints = [point];
    linePointsRef.current = newPoints;
    setLinePoints(newPoints);

    // タッチされた面の法線から押し出し方向を判別
    let dir: 'X' | 'Y' | 'Z' = 'Z';
    if (e.face) {
      const normal = e.face.normal.clone();
      if (meshRef.current) {
        normal.applyQuaternion(meshRef.current.quaternion); // ワールド座標系への変換
      }
      
      if (Math.abs(normal.z) > 0.8) {
        dir = 'Z'; // 前面・背面 -> Z軸方向(時間)
      } else if (Math.abs(normal.x) > 0.8) {
        dir = 'X'; // 左右側面 -> X軸方向(左右)
      } else {
        dir = 'Y'; // 天面・底面 -> Y軸方向(上下)
      }
      drawDirectionRef.current = dir;
    }

    onDrawProgress(newPoints, dir); // 初回呼び出し
    onPointSampled(point, 'START');
  };

  // ポインタームーブ (ドラッグ中)
  const handlePointerMove = (e: any) => {
    if (toolMode !== 'draw' || !isDrawing) return;
    e.stopPropagation();

    // ★非同期ステートによるRace Conditionを防ぐため、常に linePointsRef.current (同期) から最新の点を読み取る
    const currentPoints = linePointsRef.current;
    if (currentPoints.length === 0) return;

    const point = e.point.clone();
    const lastPoint = currentPoints[currentPoints.length - 1];

    const dist = lastPoint.distanceTo(point);
    const stepSize = 0.005; // 補間ピッチ。滑らかさと安全性の最適バランスの0.005に変更

    if (dist >= stepSize) {
      const steps = Math.floor(dist / stepSize);
      const addedPoints: THREE.Vector3[] = [];

      for (let i = 1; i <= steps; i++) {
        const ratio = i / steps;
        const interpolatedPoint = new THREE.Vector3().lerpVectors(lastPoint, point, ratio);
        
        // 直前の補間点との極小の重複も防止する
        const prevCompare = addedPoints.length > 0 ? addedPoints[addedPoints.length - 1] : lastPoint;
        if (prevCompare.distanceTo(interpolatedPoint) > 0.0001) {
          addedPoints.push(interpolatedPoint);
          onPointSampled(interpolatedPoint, 'DRAW');
        }
      }

      if (addedPoints.length > 0) {
        const nextPoints = [...currentPoints, ...addedPoints];
        linePointsRef.current = nextPoints; // 同期的に ref を更新 (次の move イベントが最新の lastPoint を参照できるようにする)
        setLinePoints(nextPoints); // 描画ライン用
        onDrawProgress(nextPoints, drawDirectionRef.current);
      }
    }
  };

  // ポインターアップ (ドラッグ終了)
  const handlePointerUp = (e: any) => {
    if (toolMode !== 'draw' || !isDrawing) return;
    e.stopPropagation();

    setIsDrawing(false);
    
    // ドローイングガイド線を消去
    setLinePoints([]);
    
    const finalPoints = linePointsRef.current;
    linePointsRef.current = []; // refのクリア

    // 親コンポーネントへドローイング完了を通知して断面構築を開始
    if (finalPoints.length >= 2) {
      onDrawComplete(finalPoints, drawDirectionRef.current);
    }
  };

  // 6面マテリアルの配列を作成
  const getMaterials = () => {
    const defaultParams = { side: THREE.DoubleSide, transparent: volumeOpacity < 1.0, opacity: volumeOpacity };
    return [
      new THREE.MeshBasicMaterial({ map: textures.right || null, ...defaultParams }),  // 右面 (+X)
      new THREE.MeshBasicMaterial({ map: textures.left || null, ...defaultParams }),   // 左面 (-X)
      new THREE.MeshBasicMaterial({ map: textures.top || null, ...defaultParams }),    // 上面 (+Y)
      new THREE.MeshBasicMaterial({ map: textures.bottom || null, ...defaultParams }), // 下面 (-Y)
      new THREE.MeshBasicMaterial({ map: textures.front || null, ...defaultParams }),  // 前面 (+Z, 手面)
      new THREE.MeshBasicMaterial({ map: textures.back || null, ...defaultParams })    // 背面 (-Z, 奥面)
    ];
  };

  const materials = getMaterials();

  // ガイド線オブジェクトの生成
  const getGuideLine = () => {
    const geom = new THREE.BufferGeometry().setFromPoints(linePoints);
    const mat = new THREE.LineBasicMaterial({ 
      color: 0xff0000, 
      linewidth: 4, 
      depthTest: false, 
      depthWrite: false 
    });
    const line = new THREE.Line(geom, mat);
    line.renderOrder = 999;
    return line;
  };

  // ★再生オフセットとスイープ軸に同期したカーテンメッシュの平行移動オフセットを計算する
  // 3D空間上で断面メッシュがボリュームからはみ出ないよう、ジオメトリのバウンディングボックスの端を基準にオフセット量を厳密にクランプ制限する
  const getCurtainPosition = () => {
    const pos = new THREE.Vector3(0, 0, 0);
    if (curtains.length === 0 || scanFrames <= 1) return pos;

    const curtain = curtains[0];
    if (!curtain.geometry.boundingBox) {
      curtain.geometry.computeBoundingBox();
    }
    const bbox = curtain.geometry.boundingBox;
    if (!bbox) return pos;

    const offset = playOffset;
    let clampedOffset = offset;
    
    if (sweepAxis === 'X') {
      const minBound = -volW / 2;
      const maxBound = volW / 2;
      const minVal = bbox.min.x;
      const maxVal = bbox.max.x;
      clampedOffset = Math.max(minBound - minVal, Math.min(maxBound - maxVal, offset));
      pos.x = clampedOffset;
    } else if (sweepAxis === 'Y') {
      const minBound = -volH / 2;
      const maxBound = volH / 2;
      const minVal = bbox.min.y;
      const maxVal = bbox.max.y;
      clampedOffset = Math.max(minBound - minVal, Math.min(maxBound - maxVal, offset));
      pos.y = clampedOffset;
    } else if (sweepAxis === 'Z') {
      const minBound = -volD / 2;
      const maxBound = volD / 2;
      const minVal = bbox.min.z;
      const maxVal = bbox.max.z;
      clampedOffset = Math.max(minBound - minVal, Math.min(maxBound - maxVal, offset));
      pos.z = clampedOffset;
    }
    return pos;
  };

  return (
    <>
      {/* 3Dボリュームメッシュ */}
      <mesh
        ref={meshRef}
        material={materials}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <boxGeometry args={[volW, volH, volD]} />
      </mesh>

      {/* ボリュームのワイヤーフレーム外枠 */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(volW, volH, volD)]} />
        <lineBasicMaterial color={0x4facfe} linewidth={2} transparent opacity={0.5} />
      </lineSegments>

      {/* ドラッグ中の赤い軌跡ガイド線 */}
      {linePoints.length >= 2 && (
        <primitive object={getGuideLine()} />
      )}

      {/* 生成された断面（タイムセクター）曲面群 (再生・スライド同期平行移動付き) */}
      {curtains.map((curtain, idx) => (
        <mesh 
          key={idx} 
          geometry={curtain.geometry} 
          material={curtain.material} 
          position={getCurtainPosition()} // ★同期オフセット位置を適用
        />
      ))}
    </>
  );
}

// Canvasラッパーコンポーネント (親からPropsを受け取る)
export default function ThreeVolume(props: ThreeVolumeProps) {
  return (
    <div id="canvas-container">
      <Canvas
        camera={{ position: [3, 3, 5], fov: 45 }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 10, 7]} intensity={0.8} />

        <SpacetimeVolumeStage {...props} />

        {/* OrbitControlsは回転モードのときのみ有効化 */}
        <OrbitControls 
          enabled={props.toolMode === 'rotate'} 
          enableDamping 
          dampingFactor={0.05} 
        />
      </Canvas>
    </div>
  );
}
