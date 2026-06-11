import { useState, useEffect } from 'react';
import { useGameStore, selectIsNearCharging, selectIsNearRepair, selectCurrentOrder } from '../store/gameStore';
import { Zap, Wrench, Coffee, Pause, Play, Save, FolderOpen, RotateCcw, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Check, ChevronUp, ChevronDown } from 'lucide-react';
import { getTutorialProgress, saveTutorialProgress } from '../game/Storage';
import { useShallow } from 'zustand/react/shallow';

export default function ControlBar({ onOpenSave, setKey }: { onOpenSave: () => void; setKey: (key: string, pressed: boolean) => void }) {
  const dispatch = useGameStore((state) => state.dispatch);
  const isPaused = useGameStore((state) => state.isPaused);
  const isCharging = useGameStore((state) => state.isCharging);
  const isRepairing = useGameStore((state) => state.isRepairing);
  const isResting = useGameStore((state) => state.isResting);
  const saveGame = useGameStore((state) => state.save);
  const loadGame = useGameStore((state) => state.load);
  const hasSavedGame = useGameStore((state) => state.hasSavedGame);
  const completedOrders = useGameStore((state) => state.player.completedOrders);
  const currentOrder = useGameStore(useShallow(selectCurrentOrder));

  const nearCharging = useGameStore(selectIsNearCharging);
  const nearRepair = useGameStore(selectIsNearRepair);

  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());

  const [tutorialCollapsed, setTutorialCollapsed] = useState<boolean>(() => {
    return getTutorialProgress().collapsed;
  });

  const [tutorialState, setTutorialState] = useState(() => {
    const p = getTutorialProgress();
    return {
      acceptedOrder: p.acceptedOrder,
      pickedUpOrder: p.pickedUpOrder,
      deliveredOrder: p.deliveredOrder,
      savedGame: p.savedGame,
    };
  });

  useEffect(() => {
    const p = getTutorialProgress();
    setTutorialState({
      acceptedOrder: p.acceptedOrder || (currentOrder !== null && completedOrders > 0),
      pickedUpOrder: p.pickedUpOrder || (currentOrder?.status === 'pickedup' || currentOrder?.status === 'delivering') || completedOrders > 0,
      deliveredOrder: p.deliveredOrder || completedOrders > 0,
      savedGame: p.savedGame || hasSavedGame,
    });
  }, [currentOrder, completedOrders, hasSavedGame]);

  const handleToggleTutorial = () => {
    const newCollapsed = !tutorialCollapsed;
    setTutorialCollapsed(newCollapsed);
    saveTutorialProgress({ collapsed: newCollapsed });
  };

  const allTutorialDone =
    tutorialState.acceptedOrder &&
    tutorialState.pickedUpOrder &&
    tutorialState.deliveredOrder &&
    tutorialState.savedGame;

  const tutorialSteps = [
    {
      key: 'acceptedOrder',
      label: '接第一单',
      hint: '在右侧订单中心点击"接单"按钮',
      done: tutorialState.acceptedOrder,
    },
    {
      key: 'pickedUpOrder',
      label: '到取货点',
      hint: '沿青色虚线行驶到绿色标记处',
      done: tutorialState.pickedUpOrder,
    },
    {
      key: 'deliveredOrder',
      label: '完成送达',
      hint: '继续行驶到红色标记的送货点',
      done: tutorialState.deliveredOrder,
    },
    {
      key: 'savedGame',
      label: '保存一次',
      hint: '点击下方"保存"按钮保存进度',
      done: tutorialState.savedGame,
    },
  ];

  const currentStepIndex = tutorialSteps.findIndex((s) => !s.done);
  const currentHint = currentStepIndex >= 0 ? tutorialSteps[currentStepIndex].hint : '恭喜！你已完成所有新手任务 🎉';

  const handleKeyPress = (key: string, pressed: boolean) => {
    setKey(key, pressed);
    setActiveKeys((prev) => {
      const next = new Set(prev);
      if (pressed) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handleCharge = () => {
    if (isCharging) {
      dispatch({ type: 'STOP_CHARGING' });
    } else if (nearCharging) {
      dispatch({ type: 'START_CHARGING' });
    }
  };

  const handleRepair = () => {
    if (isRepairing) {
      dispatch({ type: 'STOP_REPAIRING' });
    } else if (nearRepair) {
      dispatch({ type: 'START_REPAIRING' });
    }
  };

  const handleRest = () => {
    if (isResting) {
      dispatch({ type: 'STOP_RESTING' });
    } else {
      dispatch({ type: 'START_RESTING' });
    }
  };

  const handleSave = () => {
    const success = saveGame();
    if (success) {
      alert('游戏已保存！');
    } else {
      alert('保存失败！');
    }
  };

  const handleLoad = () => {
    const success = loadGame();
    if (success) {
      alert('游戏已加载！');
    } else {
      alert('没有找到存档！');
    }
  };

  const handleNewGame = () => {
    if (confirm('确定要开始新游戏吗？当前进度将丢失！')) {
      dispatch({ type: 'NEW_GAME' });
    }
  };

  const directionBtnClass = (key: string) => `
    w-12 h-12 flex items-center justify-center
    bg-game-nightLight border-2 border-game-neon/50 rounded
    active:bg-game-neon active:text-game-night
    transition-all duration-100
    ${activeKeys.has(key) ? 'bg-game-neon text-game-night' : 'text-game-neon'}
  `;

  return (
    <div className="game-card p-4 space-y-3">
      {!allTutorialDone && (
        <div className="border-2 border-game-neon/40 rounded bg-game-night/60">
          <div
            className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-game-neon/10 transition-colors"
            onClick={handleToggleTutorial}
          >
            <div className="flex items-center gap-2">
              <span className="font-pixel text-xs text-game-neon">📝 新手任务</span>
              <span className="font-retro text-xs text-gray-400">
                {tutorialSteps.filter((s) => s.done).length}/{tutorialSteps.length}
              </span>
            </div>
            {tutorialCollapsed ? (
              <ChevronDown size={16} className="text-game-neon" />
            ) : (
              <ChevronUp size={16} className="text-game-neon" />
            )}
          </div>
          {!tutorialCollapsed && (
            <div className="px-3 pb-3 space-y-2 border-t border-game-neon/20 pt-2">
              <div className="grid grid-cols-4 gap-2">
                {tutorialSteps.map((step, idx) => (
                  <div
                    key={step.key}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded border ${
                      step.done
                        ? 'bg-game-success/20 border-game-success/50'
                        : currentStepIndex === idx
                        ? 'bg-game-neon/15 border-game-neon/60 animate-pulse'
                        : 'bg-game-night/50 border-gray-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 flex items-center justify-center rounded-full border flex-shrink-0 ${
                        step.done
                          ? 'bg-game-success border-game-success text-game-night'
                          : 'border-gray-500'
                      }`}
                    >
                      {step.done && <Check size={10} strokeWidth={4} />}
                      {!step.done && (
                        <span className="text-[10px] font-retro text-gray-400">{idx + 1}</span>
                      )}
                    </div>
                    <span
                      className={`font-retro text-xs ${
                        step.done
                          ? 'text-game-success line-through'
                          : currentStepIndex === idx
                          ? 'text-game-neon'
                          : 'text-gray-400'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-center font-retro text-xs text-game-streetLight bg-game-streetLight/10 rounded px-2 py-1">
                💡 {currentHint}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-3 gap-1">
            <div></div>
            <button
              className={directionBtnClass('w')}
              onMouseDown={() => handleKeyPress('w', true)}
              onMouseUp={() => handleKeyPress('w', false)}
              onMouseLeave={() => handleKeyPress('w', false)}
              onTouchStart={() => handleKeyPress('w', true)}
              onTouchEnd={() => handleKeyPress('w', false)}
            >
              <ArrowUp size={20} />
            </button>
            <div></div>
            <button
              className={directionBtnClass('a')}
              onMouseDown={() => handleKeyPress('a', true)}
              onMouseUp={() => handleKeyPress('a', false)}
              onMouseLeave={() => handleKeyPress('a', false)}
              onTouchStart={() => handleKeyPress('a', true)}
              onTouchEnd={() => handleKeyPress('a', false)}
            >
              <ArrowLeft size={20} />
            </button>
            <button
              className={directionBtnClass('s')}
              onMouseDown={() => handleKeyPress('s', true)}
              onMouseUp={() => handleKeyPress('s', false)}
              onMouseLeave={() => handleKeyPress('s', false)}
              onTouchStart={() => handleKeyPress('s', true)}
              onTouchEnd={() => handleKeyPress('s', false)}
            >
              <ArrowDown size={20} />
            </button>
            <button
              className={directionBtnClass('d')}
              onMouseDown={() => handleKeyPress('d', true)}
              onMouseUp={() => handleKeyPress('d', false)}
              onMouseLeave={() => handleKeyPress('d', false)}
              onTouchStart={() => handleKeyPress('d', true)}
              onTouchEnd={() => handleKeyPress('d', false)}
            >
              <ArrowRight size={20} />
            </button>
          </div>
          <div className="font-retro text-xs text-gray-500 ml-2">
            <p>WASD / 方向键移动</p>
            <p>ESC 暂停</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCharge}
            disabled={!nearCharging && !isCharging}
            className={`pixel-btn text-xs flex items-center gap-1 ${
              isCharging ? 'pixel-btn-success' : !nearCharging ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Zap size={14} />
            {isCharging ? '停止充电' : '充电'}
          </button>

          <button
            onClick={handleRepair}
            disabled={!nearRepair && !isRepairing}
            className={`pixel-btn text-xs flex items-center gap-1 ${
              isRepairing ? 'pixel-btn-success' : !nearRepair ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Wrench size={14} />
            {isRepairing ? '停止维修' : '修车'}
          </button>

          <button
            onClick={handleRest}
            className={`pixel-btn text-xs flex items-center gap-1 ${
              isResting ? 'pixel-btn-success' : ''
            }`}
          >
            <Coffee size={14} />
            {isResting ? '停止休息' : '休息'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => dispatch({ type: 'TOGGLE_PAUSE' })}
            className="pixel-btn text-xs flex items-center gap-1"
          >
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
            {isPaused ? '继续' : '暂停'}
          </button>

          <button
            onClick={handleSave}
            className="pixel-btn pixel-btn-success text-xs flex items-center gap-1"
          >
            <Save size={14} />
            保存
          </button>

          <button
            onClick={onOpenSave}
            className="pixel-btn text-xs flex items-center gap-1"
          >
            <FolderOpen size={14} />
            存档
          </button>

          <button
            onClick={handleNewGame}
            className="pixel-btn pixel-btn-danger text-xs flex items-center gap-1"
          >
            <RotateCcw size={14} />
            新游戏
          </button>
        </div>
      </div>

      {nearCharging && !isCharging && (
        <div className="mt-2 text-center text-game-neon font-retro text-xs animate-pulse">
          ⚡ 你在充电站附近，可以充电
        </div>
      )}
      {nearRepair && !isRepairing && (
        <div className="mt-2 text-center text-game-streetLight font-retro text-xs animate-pulse">
          🔧 你在修车铺附近，可以修车
        </div>
      )}
      {isResting && (
        <div className="mt-2 text-center text-game-success font-retro text-xs animate-pulse">
          ☕ 正在休息恢复体力...点击"停止休息"继续送货
        </div>
      )}
    </div>
  );
}
