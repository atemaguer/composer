import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode
} from "react";
import { createElement } from "react";
import { rootReducer, initialState } from "./reducer.js";
import type { TuiAction, TuiInit, TuiState } from "./types.js";

type TuiStore = {
  state: TuiState;
  dispatch: Dispatch<TuiAction>;
};

const TuiContext = createContext<TuiStore | null>(null);

export function TuiProvider(props: { init: TuiInit; children: ReactNode }) {
  const [state, dispatch] = useReducer(rootReducer, props.init, initialState);
  return createElement(TuiContext.Provider, { value: { state, dispatch } }, props.children);
}

export function useTui(): TuiStore {
  const store = useContext(TuiContext);
  if (!store) {
    throw new Error("useTui must be used within a <TuiProvider>");
  }
  return store;
}
