import { create } from 'zustand';
import type { GameState, GameAction, GameSave, Order, TutorialProgress } from '../game/types';
import { generateMapData, findPath } from '../game/mapData';
import { generateOrder, updateOrderDeadlines, isAtLocation, canAcceptOrder } from '../game/OrderSystem';
import { updateWeather, createInitialWeather } from '../game/WeatherSystem';
import {
  moveVehicle,
  createInitialVehicle,
  chargeVehicle,
  repairVehicle,
  restPlayer,
  isNearChargingStation,
  isNearRepairShop,
} from '../game/VehicleSystem';
import { calculateSettlement } from '../game/EconomySystem';
import { saveGame, loadGame, saveTutorialProgress, getTutorialProgress } from '../game/Storage';
import {
  PLAYER_START,
  MAX_AVAILABLE_ORDERS,
  ORDER_GENERATION_INTERVAL,
} from '../game/constants';

function createFreshTutorial(): TutorialProgress {
  const saved = getTutorialProgress();
  return {
    acceptedOrder: false,
    pickedUpOrder: false,
    deliveredOrder: false,
    savedGame: false,
    collapsed: saved.collapsed,
  };
}

function deriveTutorialFromSave(save: GameSave): TutorialProgress {
  const saved = getTutorialProgress();
  const completedOrders = save.player.completedOrders;
  const hasCurrentOrder = save.player.currentOrderId !== null;
  const currentOrder = hasCurrentOrder
    ? save.orders.find((o) => o.id === save.player.currentOrderId)
    : null;
  return {
    acceptedOrder: saved.acceptedOrder || completedOrders > 0 || hasCurrentOrder,
    pickedUpOrder: saved.pickedUpOrder || completedOrders > 0 || currentOrder?.status === 'pickedup' || currentOrder?.status === 'delivering',
    deliveredOrder: saved.deliveredOrder || completedOrders > 0,
    savedGame: saved.savedGame || true,
    collapsed: saved.collapsed,
  };
}

export function createInitialState(): GameState {
  const map = generateMapData();
  const tutorial = createFreshTutorial();
  return {
    player: {
      id: 'player-1',
      name: '送货员',
      money: 100,
      stamina: 100,
      maxStamina: 100,
      position: { ...PLAYER_START },
      currentOrderId: null,
      completedOrders: 0,
      totalRating: 0,
    },
    vehicle: createInitialVehicle(),
    weather: createInitialWeather(),
    orders: [],
    incomeRecords: [],
    map,
    gameTime: 0,
    isPaused: false,
    isGameOver: false,
    showSettlement: false,
    lastSettlement: null,
    plannedPath: [],
    isCharging: false,
    isRepairing: false,
    isResting: false,
    hasSavedGame: tutorial.savedGame,
    tutorial,
  };
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'MOVE': {
      if (state.isPaused || state.isGameOver || state.isCharging || state.isRepairing || state.isResting) {
        return state;
      }

      const { vehicle, moved, staminaDrain } = moveVehicle(
        state.vehicle,
        action.direction,
        state.weather,
        1 / 60,
        state.map.roads,
        state.player.stamina
      );

      if (!moved) return state;

      const newPlayer = {
        ...state.player,
        position: vehicle.position,
        stamina: Math.max(0, state.player.stamina - staminaDrain),
      };
      let newPlannedPath = state.plannedPath;

      if (newPlannedPath.length > 0) {
        const nextPoint = newPlannedPath[0];
        if (isAtLocation(vehicle.position, nextPoint, 20)) {
          newPlannedPath = newPlannedPath.slice(1);
        }
      }

      return {
        ...state,
        player: newPlayer,
        vehicle,
        plannedPath: newPlannedPath,
      };
    }

    case 'ACCEPT_ORDER': {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order || !canAcceptOrder(order, state.player)) return state;

      const path = findPath(
        state.vehicle.position.x,
        state.vehicle.position.y,
        order.pickupLocation.x,
        order.pickupLocation.y,
        state.map.roads,
        state.map.gridSize
      );

      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId ? { ...o, status: 'accepted' as const } : o
        ),
        player: { ...state.player, currentOrderId: action.orderId },
        plannedPath: path,
        tutorial: { ...state.tutorial, acceptedOrder: true },
      };
    }

    case 'PICKUP_ORDER': {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order || order.status !== 'accepted') return state;

      if (!isAtLocation(state.player.position, order.pickupLocation, 50)) return state;

      const path = findPath(
        state.vehicle.position.x,
        state.vehicle.position.y,
        order.deliveryLocation.x,
        order.deliveryLocation.y,
        state.map.roads,
        state.map.gridSize
      );

      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId ? { ...o, status: 'pickedup' as const } : o
        ),
        plannedPath: path,
        tutorial: { ...state.tutorial, acceptedOrder: true, pickedUpOrder: true },
      };
    }

    case 'DELIVER_ORDER': {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order || (order.status !== 'pickedup' && order.status !== 'delivering')) return state;

      if (!isAtLocation(state.player.position, order.deliveryLocation, 50)) return state;

      const settlement = calculateSettlement(order, state.player.stamina);

      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId ? { ...o, status: 'completed' as const } : o
        ),
        player: {
          ...state.player,
          money: state.player.money + settlement.record.finalAmount,
          currentOrderId: null,
          completedOrders: state.player.completedOrders + 1,
          totalRating: state.player.totalRating + settlement.rating,
        },
        incomeRecords: [...state.incomeRecords, settlement.record],
        showSettlement: true,
        lastSettlement: settlement.record,
        plannedPath: [],
        tutorial: {
          ...state.tutorial,
          acceptedOrder: true,
          pickedUpOrder: true,
          deliveredOrder: true,
        },
      };
    }

    case 'START_CHARGING': {
      if (!isNearChargingStation(state.player.position, state.map.chargingStations)) return state;
      return { ...state, isCharging: true, isRepairing: false, isResting: false };
    }

    case 'STOP_CHARGING': {
      return { ...state, isCharging: false };
    }

    case 'START_REPAIRING': {
      if (!isNearRepairShop(state.player.position, state.map.repairShops)) return state;
      return { ...state, isRepairing: true, isCharging: false, isResting: false };
    }

    case 'STOP_REPAIRING': {
      return { ...state, isRepairing: false };
    }

    case 'START_RESTING': {
      return { ...state, isResting: true, isCharging: false, isRepairing: false };
    }

    case 'STOP_RESTING': {
      return { ...state, isResting: false };
    }

    case 'GENERATE_ORDERS': {
      const availableOrders = state.orders.filter((o) => o.status === 'available');
      if (availableOrders.length >= MAX_AVAILABLE_ORDERS) return state;

      const newOrder = generateOrder(
        state.map,
        state.player.position,
        state.gameTime,
        state.orders
      );

      if (!newOrder) return state;

      return { ...state, orders: [...state.orders, newOrder] };
    }

    case 'TICK': {
      if (state.isPaused || state.isGameOver) return state;

      let newState = {
        ...state,
        gameTime: state.gameTime + action.deltaTime,
      };

      newState.orders = updateOrderDeadlines(newState.orders, action.deltaTime);
      newState.weather = updateWeather(newState.weather, action.deltaTime);

      if (newState.isCharging) {
        const { vehicle, cost } = chargeVehicle(newState.vehicle, action.deltaTime);
        newState.vehicle = vehicle;
        newState.player = {
          ...newState.player,
          money: Math.max(0, newState.player.money - cost),
        };
        if (vehicle.battery >= vehicle.maxBattery) {
          newState.isCharging = false;
        }
      }

      if (newState.isRepairing) {
        const { vehicle, cost } = repairVehicle(newState.vehicle, action.deltaTime);
        newState.vehicle = vehicle;
        newState.player = {
          ...newState.player,
          money: Math.max(0, newState.player.money - cost),
        };
        if (vehicle.durability >= vehicle.maxDurability) {
          newState.isRepairing = false;
        }
      }

      if (newState.isResting) {
        const { stamina, cost } = restPlayer(
          newState.player.stamina,
          newState.player.maxStamina,
          action.deltaTime
        );
        newState.player = {
          ...newState.player,
          stamina,
          money: Math.max(0, newState.player.money - cost),
        };
        if (stamina >= newState.player.maxStamina) {
          newState.isResting = false;
        }
      }

      const currentOrder = newState.orders.find((o) => o.id === newState.player.currentOrderId);
      if (currentOrder && currentOrder.status === 'accepted') {
        if (isAtLocation(newState.player.position, currentOrder.pickupLocation, 50)) {
          newState = gameReducer(newState, { type: 'PICKUP_ORDER', orderId: currentOrder.id });
        }
      }
      if (currentOrder && (currentOrder.status === 'pickedup' || currentOrder.status === 'delivering')) {
        if (isAtLocation(newState.player.position, currentOrder.deliveryLocation, 50)) {
          newState = gameReducer(newState, { type: 'DELIVER_ORDER', orderId: currentOrder.id });
        }
      }

      const failedOrders = newState.orders.filter((o) => o.status === 'failed' && o.id === newState.player.currentOrderId);
      if (failedOrders.length > 0) {
        newState.player = { ...newState.player, currentOrderId: null };
        newState.plannedPath = [];
      }

      if (newState.player.money < 0 && newState.player.stamina < 10 && newState.vehicle.battery < 10) {
        newState.isGameOver = true;
      }

      return newState;
    }

    case 'TOGGLE_PAUSE': {
      return { ...state, isPaused: !state.isPaused };
    }

    case 'CLOSE_SETTLEMENT': {
      return { ...state, showSettlement: false };
    }

    case 'PLAN_PATH': {
      return { ...state, plannedPath: action.path };
    }

    case 'CLEAR_PATH': {
      return { ...state, plannedPath: [] };
    }

    case 'NEW_GAME': {
      const newState = createInitialState();
      const freshTutorial = createFreshTutorial();
      const initialOrders: typeof newState.orders = [];
      for (let i = 0; i < 3; i++) {
        const order = generateOrder(
          newState.map,
          newState.player.position,
          0,
          initialOrders
        );
        if (order) initialOrders.push(order);
      }
      saveTutorialProgress(freshTutorial);
      return { ...newState, orders: initialOrders, tutorial: freshTutorial, hasSavedGame: false };
    }

    case 'LOAD_GAME': {
      const save = action.save;
      const tutorial = deriveTutorialFromSave(save);
      saveTutorialProgress(tutorial);
      return {
        ...createInitialState(),
        player: save.player,
        vehicle: save.vehicle,
        weather: save.weather,
        orders: save.orders,
        incomeRecords: save.incomeRecords,
        gameTime: save.gameTime,
        map: save.map,
        tutorial,
        hasSavedGame: tutorial.savedGame,
      };
    }

    case 'TOGGLE_TUTORIAL': {
      const collapsed = !state.tutorial.collapsed;
      saveTutorialProgress({ collapsed });
      return {
        ...state,
        tutorial: { ...state.tutorial, collapsed },
      };
    }

    case 'GAME_OVER': {
      return { ...state, isGameOver: true };
    }

    default:
      return state;
  }
}

interface GameStore extends GameState {
  dispatch: (action: GameAction) => void;
  save: () => boolean;
  load: () => boolean;
  orderGenerationTimer: number;
}

export const useGameStore = create<GameStore>((set, get) => {
  const initialState = createInitialState();
  let orderGenTimer = 0;

  const initialOrders: typeof initialState.orders = [];
  for (let i = 0; i < 3; i++) {
    const order = generateOrder(
      initialState.map,
      initialState.player.position,
      0,
      initialOrders
    );
    if (order) initialOrders.push(order);
  }

  return {
    ...initialState,
    orders: initialOrders,
    orderGenerationTimer: 0,

    dispatch: (action) => {
      set((state) => gameReducer(state, action));
    },

    save: () => {
      const state = get();
      const success = saveGame(
        state.player,
        state.vehicle,
        state.weather,
        state.orders,
        state.incomeRecords,
        state.gameTime,
        state.map
      );
      if (success) {
        const tutorialUpdate = { ...state.tutorial, savedGame: true };
        saveTutorialProgress(tutorialUpdate);
        set({ hasSavedGame: true, tutorial: tutorialUpdate });
      }
      return success;
    },

    load: () => {
      const save = loadGame();
      if (save) {
        set((state) => gameReducer(state, { type: 'LOAD_GAME', save }));
        return true;
      }
      return false;
    },
  };
});

export const selectCurrentOrder = (state: GameState): Order | null => {
  if (!state.player.currentOrderId) return null;
  return state.orders.find((o) => o.id === state.player.currentOrderId) || null;
};

export const selectAvailableOrders = (state: GameState): Order[] => {
  return state.orders.filter((o) => o.status === 'available');
};

export const selectIsNearCharging = (state: GameState): boolean => {
  return isNearChargingStation(state.player.position, state.map.chargingStations);
};

export const selectIsNearRepair = (state: GameState): boolean => {
  return isNearRepairShop(state.player.position, state.map.repairShops);
};

export function useCurrentOrder(): Order | null {
  return useGameStore(selectCurrentOrder);
}

export function useAvailableOrders(): Order[] {
  return useGameStore(selectAvailableOrders);
}

export function useIsNearCharging(): boolean {
  return useGameStore(selectIsNearCharging);
}

export function useIsNearRepair(): boolean {
  return useGameStore(selectIsNearRepair);
}

export const selectTutorial = (state: GameState) => state.tutorial;
