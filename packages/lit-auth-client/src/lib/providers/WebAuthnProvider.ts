import {
  AuthMethod,
  BaseProviderOptions,
  RelayerRequest,
} from '@lit-protocol/types';
import { AuthMethodType } from '@lit-protocol/constants';
import { ethers, utils } from 'ethers';
import {
  PublicKeyCredentialCreationOptionsJSON,
  UserVerificationRequirement,
} from '@simplewebauthn/typescript-types';
import base64url from 'base64url';
import { getRPIdFromOrigin, parseAuthenticatorData } from '../utils';
import { BaseProvider } from './BaseProvider';
import { RegistrationResponseJSON } from '@simplewebauthn/typescript-types';

export default class WebAuthnProvider extends BaseProvider {
  /**
   * WebAuthn attestation data
   */
  #attestationResponse: any | undefined;

  constructor(options: BaseProviderOptions) {
    super(options);
  }

  /**
   * Generate registration options for the browser to pass to a supported authenticator
   *
   * @param {string} username - Username to register credential with
   *
   * @returns {Promise<PublicKeyCredentialCreationOptionsJSON>} - Options to pass to the authenticator
   */
  public async register(
    username?: string
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    return await this.relay.generateRegistrationOptions(username);
  }

  /**
   * Mint PKP with verified registration data
   *
   * @param {PublicKeyCredentialCreationOptionsJSON} options - Registration options to pass to the authenticator
   *
   * @returns {Promise<string>} - Mint transaction hash
   */
  public async verifyAndMintPKPThroughRelayer(
    options: PublicKeyCredentialCreationOptionsJSON
  ): Promise<string> {
    // Submit registration options to the authenticator
    const { startRegistration } = await import('@simplewebauthn/browser');
    const attResp: RegistrationResponseJSON = await startRegistration(options);

    const authMethodId: string = await this.getAuthMethodId();

    // create a buffer object from the base64 encoded content.
    const attestationBuffer = Buffer.from(
      attResp.response.attestationObject,
      'base64'
    );

    let publicKey: string;
    try {
      // parse the buffer to reconstruct the object.
      // buffer is COSE formatted, utilities decode the buffer into json, and extract the public key information
      const authenticationResponse: any =
        parseAuthenticatorData(attestationBuffer);
      // publickey in cose format to register the auth method
      const publicKeyCoseBuffer: Buffer = authenticationResponse
        .attestedCredentialData.credentialPublicKey as Buffer;
      // Encode the publicKey for contract storage
      publicKey = utils.hexlify(utils.arrayify(publicKeyCoseBuffer));
    } catch (e) {
      throw new Error(
        `Error while decoding credential create response for public key retrieval. attestation response not encoded as expected: ${e}`
      );
    }

    const req: RelayerRequest = {
      authMethodType: AuthMethodType.WebAuthn,
      authMethodId,
      authMethodPubKey: publicKey,
    };
    const mintRes = await this.relay.mintPKP(
      AuthMethodType.WebAuthn,
      JSON.stringify(req)
    );
    if (!mintRes || !mintRes.requestId) {
      throw new Error('Missing mint response or request ID from relay server');
    }
    // If the credential was verified and registration successful, minting has kicked off
    return mintRes.requestId;
  }

  /**
   * @override
   * This method is not applicable for WebAuthnProvider and should not be used.
   * Use verifyAndMintPKPThroughRelayer instead to mint a PKP for a WebAuthn credential.
   *
   * @throws {Error} - Throws an error when called for WebAuthnProvider.
   */
  public override async mintPKPThroughRelayer(): Promise<string> {
    throw new Error(
      'Use verifyAndMintPKPThroughRelayer for WebAuthnProvider instead.'
    );
  }

  /**
   * Authenticate with a WebAuthn credential and return the relevant authentication data
   *
   * @returns {Promise<AuthMethod>} - Auth method object containing WebAuthn authentication data
   */
  public async authenticate(): Promise<AuthMethod> {
    const provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);

    const block = await provider.getBlock('latest');
    const blockHash = block.hash;

    // Turn into byte array
    const blockHashBytes = utils.arrayify(blockHash);

    // Construct authentication options
    const rpId = getRPIdFromOrigin(window.location.origin);

    const authenticationOptions = {
      challenge: base64url(Buffer.from(blockHashBytes)),
      timeout: 60000,
      userVerification: 'required' as UserVerificationRequirement,
      rpId,
    };

    // Authenticate with WebAuthn
    const { startAuthentication } = await import('@simplewebauthn/browser');
    const authenticationResponse = await startAuthentication(
      authenticationOptions
    );

    const actualAuthenticationResponse = JSON.parse(
      JSON.stringify(authenticationResponse)
    );

    // Make sure userHandle is base64url encoded if it exists
    const userHandle = authenticationResponse.response?.userHandle;
    if (userHandle) {
      actualAuthenticationResponse.response.userHandle =
        base64url.encode(userHandle);
    }

    this.#attestationResponse = actualAuthenticationResponse;

    const authMethod = {
      authMethodType: AuthMethodType.WebAuthn,
      accessToken: JSON.stringify(actualAuthenticationResponse),
    };

    return authMethod;
  }

  /**
   * Check whether the authentication data is valid. For WebAuthn,
   *
   * @returns {Promise<boolean>} - True if authentication data is valid
   */
  public async verify(): Promise<boolean> {
    throw new Error(
      'Call useSessionSigs as the Lit nodes will verify the WebAuthn credential when generating session sigs.'
    );
  }

  /**
   * Derive unique identifier from authentication material produced by auth providers
   *
   * @returns {Promise<string>} - Auth method id that can be used for look-up and as an argument when
   * interacting directly with Lit contracts
   */
  public async getAuthMethodId(): Promise<string> {
    if (!this.#attestationResponse) {
      throw new Error(
        'Authentication data is not defined. Call authenticate first.'
      );
    }
    const credentialRawId = this.#attestationResponse.rawId;
    const authMethodId: string = utils.keccak256(
      utils.toUtf8Bytes(`${credentialRawId}:lit`)
    );
    return authMethodId;
  }

  /**
   * Constructs a {@link RelayerRequest} from the attestation response from authentication, {@link authenticate} must be called prior.
   * Intended for fetching pkp information from relayers.
   * @returns {Promise<RelayerRequest>} Formed request for sending to Relayer Server
   */
  protected override async getRelayerRequest(): Promise<RelayerRequest> {
    if (!this.#attestationResponse) {
      throw new Error('Access token is not defined. Call authenticate first.');
    }
    const authMethodId = await this.getAuthMethodId();
    return {
      authMethodType: AuthMethodType.WebAuthn,
      authMethodId,
    };
  }
}
