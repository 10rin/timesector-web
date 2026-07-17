### 1. 3D Volumeの「物理サイズ」生成方法                                            
                                                                                      
  3D空間上に描画される直方体ボリュームの縦・横・奥行きの物理サイズ（ volW ,  volH ,  volD ）の決定方法です。                                                             
                                                                                      
  • 処理を担当する関数:  updateVolumeSize  （App.tsx）                                
  • 決定方法:                                                                         
  入力動画の「横幅  w 」「縦幅  h 」「総フレーム数  tf                                
  （時間）」の中で、最も大きい数値（最大次元）が3D空間上で  2.5                       
  （基準サイズ）になるように縮尺（ scale                                              
  ）を計算し、アスペクト比を維持したまま各辺のサイズを決定します。                    
  • 計算式:                                                                           
    const maxDim = Math.max(w, h, tf);                                                
    const scale = 2.5 / maxDim;                                                       
                                                                                      
    setVolW(w * scale);      // 3Dボリュームの横幅                                    
    setVolH(h * scale);      // 3Dボリュームの高さ                                    
    setVolD(tf * scale);     // 3Dボリュームの奥行き（時間軸）                        
                                                                                      
  ──────                                                                              
  ### 2. 3D Volumeに貼る「表面画像」のサイズ生成方法                                  
                                                                                      
  3D直方体ボリュームの表面（前面・背面・左側面・右側面・天面・底面）に貼り付けるテクスチャ画像のピクセルサイズ（width / height）の決定方法です。                          
                                                                                      
  • 処理を担当する関数:  initVolumeTextures  （App.tsx）                              
  • 決定方法:                                                                         
      • 空間だけの面（前面・背面）は、動画の元の高解像度（ w  x  h ）をそのまま使います。                                                          
      • 時間軸（奥行き）が絡む側面は、軽量化のために間引き設定である  scanFrames  ( sf
      = 75) をピクセル解像度として適用します。                                        
  • 各面のサイズ仕様:                                                                 
   貼り付け面      │ 横幅 (width)       │ 縦幅 (height)      │ 備考
  ─────────────────┼────────────────────┼────────────────────┼────────────────────────
   前面 / 背面     │  w  (動画元の横幅) │  h  (動画元の縦幅) │ 空間解像度を維持
   左側面 / 右側面 │  sf  (75)          │  h  (動画元の縦幅) │ 時間軸方向を75pxにリサ
                   │                    │                    │ イズ
   天面 / 底面     │  w  (動画元の横幅) │  sf  (75)          │ 時間軸方向を75pxにリサ
                   │                    │                    │ イズ
                                                                                      
  ──────                                                                              
  ### 3. カーテン面（スライス断面）に貼る画像のサイズ生成方法                         
                                                                                      
  3D空間内の赤いスライス断面（カーテン）に貼り付けるテクスチャ画像のピクセルサイズ（wi
  dth / height）の決定方法です。                                                      
                                                                                      
  • 決定方法:                                                                         
  2Dプレビューを表示している Canvas ( previewCanvas ) の実ピクセルサイズ（横  texW  x 縦  texH ）を、そのまま Three.js の  CanvasTexture として毎フレーム共有バインドしています。                                            
  • 各辺のサイズ決定ロジック:                                                         
      • 横幅 ( texW ): スライスした軌跡の点の数（ N ）。                              
      • 縦幅 ( texH ): スライスの「押し出し方向」によって動的に決定します。           
          • Z軸押し出し (時間方向):  totalFrames （元の総フレーム数、間引きなし）     
          • X軸押し出し (左右方向): キャッシュされたフレーム画像の横幅（ 960 ）       
          • Y軸押し出し (上下方向): キャッシュされたフレーム画像の縦幅（ 540 ）       
                                                                                      
                                                                                      
  ──────                                                                              
  ### 4. 実際にピクセルサンプリングするソースコード                                   
                                                                                      
  プレビュー再生時や、スライドバー操作時にリアルタイムでピクセルを間引きなしで抽出し、プレビュー画像を再構成している核心部分のソースコードです。                          
                                                                                      
  • ファイルと場所: App.tsx                                                           
  • 処理フロー:                                                                       
      1. 3D空間上のスライス座標に、現在の再生オフセット値（ currentOffsetVal ）を加算して、3Dサンプリング点を作ります。                                      
      2. 3Dポイントを、ビデオフレームのピクセル座標  (x, y)  とフレームインデックスframe  に逆変換します。                                                         
      3.  texH  x  N  のループを回し、指定フレームの縮小キャッシュ画像（ 960x540      
      Canvas）の  (sampleX, sampleY)  からピクセル（RGBA）を抽出し、出力用配列        
      imgData.data  に直接コピーします。                                              
                                                                                      
                                                                                      
      // 2D プレビューキャンバスへのリアルタイムスリットスキャンサンプリング描画関数  
      const drawPreviewCanvas = (currentOffsetVal: number) => {                       
        const canvas = previewCanvasRef.current;                                      
        if (!canvas) return;                                                          
                                                                                      
        const N = lastLinePointsRef.current.length;                                   
        const canvases = scanFrameCanvasesRef.current; //                             
  キャッシュされた全フレームのCanvas (配列長: totalFrames)                            
                                                                                      
        const ctx = canvas.getContext('2d');                                          
        if (!ctx) return;                                                             
                                                                                      
        if (N < 2 || canvases.length === 0) {                                         
          // 軌跡がない場合はクリア                                                   
          canvas.width = 400;                                                         
          canvas.height = 300;                                                        
          ctx.fillStyle = '#ffffff';                                                  
          ctx.fillRect(0, 0, canvas.width, canvas.height);                            
          return;                                                                     
        }                                                                             
                                                                                      
        const extrudeDirection = lastExtrudeDirectionRef.current;                     
                                                                                      
        let texW = N;                                                                 
        let texH = 128;                                                               
        if (extrudeDirection === 'Z') {                                               
          texH = totalFrames; // ★時間方向の解像度は「動画の総フレーム数」で間引きなし
        } else if (extrudeDirection === 'X') {                                        
          texH = canvases[0]?.width || 960;                                           
        } else {                                                                      
          texH = canvases[0]?.height || 540;                                          
        }                                                                             
                                                                                      
        // キャンバスのピクセルサイズを出力サイズにリサイズ                           
        if (canvas.width !== texW || canvas.height !== texH) {                        
          canvas.width = texW;                                                        
          canvas.height = texH;                                                       
        }                                                                             
                                                                                      
        const imgData = ctx.createImageData(texW, texH);                              
        const data = imgData.data;                                                    
                                                                                      
        // 1.                                                                         
  3D空間座標に現在のオフセット量を加算し、ビデオ用のピクセル・フレーム座標に逆変換    
        const pathCoords = lastLinePointsRef.current.map(pt => {                      
          const opt = pt.clone();                                                     
          if (sweepAxis === 'X') opt.x += currentOffsetVal;                           
          else if (sweepAxis === 'Y') opt.y += currentOffsetVal;                      
          else if (sweepAxis === 'Z') opt.z += currentOffsetVal;                      
          return getPixelCoordsLocal(opt); // 戻り値: { x, y, frame }                 
        });                                                                           
                                                                                      
        // 2. 出力画像の全ピクセル(u, v)をループ処理してサンプリング抽出              
        for (let v = 0; v < texH; v++) {                                              
          for (let u = 0; u < N; u++) {                                               
            const coords = pathCoords[u];                                             
            let frameIdx = 0;                                                         
            let sampleX = 0;                                                          
            let sampleY = 0;                                                          
                                                                                      
            if (extrudeDirection === 'Z') {                                           
              // Z軸押し出し (前面・背面クリック、縦軸 v は時間インデックス)          
              frameIdx = Math.round((v / (texH - 1)) * (canvases.length - 1)); // 0 〜
  299 などの全フレーム                                                                
              const cacheCanvas = canvases[frameIdx];                                 
              sampleX = Math.round((coords.x / videoWidth) * cacheCanvas.width);      
              sampleY = Math.round((coords.y / videoHeight) * cacheCanvas.height);    
            }                                                                         
            else if (extrudeDirection === 'X') {                                      
              // X軸押し出し (左右側面、縦軸 v は X座標)                              
              const frameRatio = coords.frame / totalFrames;                          
              frameIdx = Math.round(frameRatio * (canvases.length - 1));              
              const cacheCanvas = canvases[frameIdx];                                 
              sampleX = Math.round((v / (texH - 1)) * cacheCanvas.width);             
              sampleY = Math.round((coords.y / videoHeight) * cacheCanvas.height);    
            }                                                                         
            else {
              // Y軸押し出し (天底面、縦軸 v は Y座標)
              const frameRatio = coords.frame / totalFrames;
              frameIdx = Math.round(frameRatio * (canvases.length - 1));
              const cacheCanvas = canvases[frameIdx];
              sampleX = Math.round((coords.x / videoWidth) * cacheCanvas.width);      
              sampleY = Math.round((v / (texH - 1)) * cacheCanvas.height);            
            }
  
            const cacheCanvas = canvases[frameIdx];
            
            // 遅延でキャッシュCanvasから生のピクセルデータ配列 (imgData) を抽出      
            if (cacheCanvas && !(cacheCanvas as any).imgData) {
              (cacheCanvas as any).imgData = cacheCanvas.getContext('2d')?.           
  getImageData(0, 0, cacheCanvas.width, cacheCanvas.height);
            }
  
            const cx = Math.max(0, Math.min(cacheCanvas.width - 1, sampleX));         
            const cy = Math.max(0, Math.min(cacheCanvas.height - 1, sampleY));        
  
            const cacheImgData = (cacheCanvas as any).imgData;
            if (cacheImgData) {
              const srcIdx = (cy * cacheCanvas.width + cx) * 4; //
  サンプリング元のキャッシュ配列インデックス
              const destIdx = (v * texW + u) * 4;               //
  出力先のプレビュー配列インデックス
  
              // ピクセルデータ (RGBA) のコピー
              data[destIdx] = cacheImgData.data[srcIdx];
              data[destIdx + 1] = cacheImgData.data[srcIdx + 1];
              data[destIdx + 2] = cacheImgData.data[srcIdx + 2];
              data[destIdx + 3] = 255; // Alpha
            }
          }
        }
  
        // 作成したピクセルデータを出力キャンバスに書き戻す
        ctx.putImageData(imgData, 0, 0);
  
        // 3D空間上のカーテン（断面メッシュ）テクスチャへ同期を通知
        if (curtainTextureRef.current) {
          curtainTextureRef.current.needsUpdate = true;
        }
      };
    