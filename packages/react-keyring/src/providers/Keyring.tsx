import React, { createContext, useState, useContext } from 'react'
import useLocalStorageState from 'use-local-storage-state'
import {
  createAgent,
  Space,
  getCurrentSpace,
  getSpaces,
  CreateDelegationOptions
} from '@w3ui/keyring-core'
import type {
  KeyringContextState,
  KeyringContextActions,
  ServiceConfig
} from '@w3ui/keyring-core'
import type { Agent } from '@web3-storage/access'
import type { Abilities } from '@web3-storage/access/types'
import type {
  Capability,
  Delegation,
  DID,
  Principal,
  Proof,
  Signer
} from '@ucanto/interface'

export { KeyringContextState, KeyringContextActions }

export type KeyringContextValue = [
  state: KeyringContextState,
  actions: KeyringContextActions
]

export const keyringContextDefaultValue: KeyringContextValue = [
  {
    space: undefined,
    spaces: [],
    agent: undefined,
    account: undefined
  },
  {
    loadAgent: async () => {},
    unloadAgent: async () => {},
    resetAgent: async () => {},
    authorize: async () => {},
    createSpace: async () => {
      throw new Error('missing keyring context provider')
    },
    setCurrentSpace: async () => {},
    registerSpace: async () => {},
    cancelRegisterSpace: () => {},
    getProofs: async () => [],
    createDelegation: async () => {
      throw new Error('missing keyring context provider')
    },
    addSpace: async () => {}
  }
]

export const KeyringContext = createContext<KeyringContextValue>(
  keyringContextDefaultValue
)

export interface KeyringProviderProps extends ServiceConfig {
  children?: JSX.Element
}

/**
 * Key management provider.
 */
export function KeyringProvider ({
  children,
  servicePrincipal,
  connection
}: KeyringProviderProps): JSX.Element {
  const [agent, setAgent] = useState<Agent>()
  const [account, setAccount] = useLocalStorageState<string>('w3ui-account-email')
  const [space, setSpace] = useState<Space>()
  const [spaces, setSpaces] = useState<Space[]>([])
  const [issuer, setIssuer] = useState<Signer>()
  const [registerAbortController, setRegisterAbortController] =
    useState<AbortController>()

  const getAgent = async (): Promise<Agent> => {
    if (agent == null) {
      const a = await createAgent({ servicePrincipal, connection })
      setAgent(a)
      setIssuer(a.issuer)
      setSpace(getCurrentSpace(a))
      setSpaces(getSpaces(a))
      return a
    }
    return agent
  }

  const authorize = async (email: string): Promise<void> => {
    const agent = await getAgent()
    const controller = new AbortController()
    setRegisterAbortController(controller)

    try {
      await agent.authorize(email, { signal: controller.signal })
      // TODO is there other state that needs to be initialized?
      setAccount(email)
      setSpace(getCurrentSpace(agent))
      setSpaces(getSpaces(agent))
    } catch (error) {
      if (!controller.signal.aborted) {
        throw error
      }
    }
  }

  const cancelRegisterSpace = (): void => {
    if (registerAbortController != null) {
      registerAbortController.abort()
    }
  }

  const createSpace = async (name?: string): Promise<DID> => {
    const agent = await getAgent()
    const { did } = await agent.createSpace(name)
    await agent.setCurrentSpace(did)
    setSpace(getCurrentSpace(agent))
    return did
  }

  const registerSpace = async (email: string): Promise<void> => {
    const agent = await getAgent()
    const controller = new AbortController()
    setRegisterAbortController(controller)

    try {
      await agent.registerSpace(email, {
        signal: controller.signal,
        provider: agent.connection.id.did()
      })
      setSpace(getCurrentSpace(agent))
      setSpaces(getSpaces(agent))
    } catch (error) {
      if (!controller.signal.aborted) {
        throw error
      }
    }
  }

  const setCurrentSpace = async (did: DID): Promise<void> => {
    const agent = await getAgent()
    await agent.setCurrentSpace(did)
    setSpace(getCurrentSpace(agent))
  }

  const loadAgent = async (): Promise<void> => {
    if (agent != null) return
    await getAgent()
  }

  const unloadAgent = async (): Promise<void> => {
    setSpace(undefined)
    setSpaces([])
    setIssuer(undefined)
    setAgent(undefined)
  }

  const resetAgent = async (): Promise<void> => {
    const agent = await getAgent()
    // @ts-expect-error TODO expose store from access client
    await Promise.all([agent.store.reset(), unloadAgent()])
  }

  const getProofs = async (caps: Capability[]): Promise<Proof[]> => {
    const agent = await getAgent()
    return agent.proofs(caps)
  }

  const createDelegation = async (
    audience: Principal,
    abilities: Abilities[],
    options: CreateDelegationOptions
  ): Promise<Delegation> => {
    const agent = await getAgent()
    const audienceMeta = options.audienceMeta ?? {
      name: 'agent',
      type: 'device'
    }
    return await agent.delegate({
      ...options,
      abilities,
      audience,
      audienceMeta
    })
  }

  const addSpace = async (proof: Delegation): Promise<void> => {
    const agent = await getAgent()
    await agent.importSpaceFromDelegation(proof)
  }

  const state = {
    space,
    spaces,
    agent: issuer,
    account
  }
  const actions = {
    authorize,
    loadAgent,
    unloadAgent,
    resetAgent,
    createSpace,
    registerSpace,
    cancelRegisterSpace,
    setCurrentSpace,
    getProofs,
    createDelegation,
    addSpace
  }

  return (
    <KeyringContext.Provider value={[state, actions]}>
      {children}
    </KeyringContext.Provider>
  )
}

/**
 * Use the scoped keyring context state from a parent KeyringProvider.
 */
export function useKeyring (): KeyringContextValue {
  return useContext(KeyringContext)
}
